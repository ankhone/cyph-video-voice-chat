#!/usr/bin/env node


const childProcess	= require('child_process');
const crypto		= require('crypto');
const fs			= require('fs');
const os			= require('os');
const path			= require('path');

const spawn			= (command, args, cwd) => (
	childProcess.spawnSync(
		command,
		args,
		{cwd: path.join(__dirname, cwd || '')}
	).stdout || ''
).toString().trim();

const spawnAsync	= (command, args, cwd) => new Promise(resolve =>
	childProcess.spawn(
		command,
		args,
		{cwd: path.join(__dirname, cwd || ''), stdio: 'inherit'}
	).on(
		'exit',
		() => { resolve(); }
	)
);

const runScript		= script => {
	const tmpFile	= path.join(os.tmpdir(), crypto.randomBytes(32).toString('hex'));
	fs.writeFileSync(tmpFile, script);
	return spawnAsync('bash', [tmpFile]);
};


const args	= {
	command: process.argv[2],
	background: process.argv.indexOf('--background') > -1,
	noUpdates: process.argv.indexOf('--no-updates') > -1,
	simple:
		process.argv.indexOf('--simple') > -1 ||
		process.argv.indexOf('--simple-custom-build') > -1 ||
		process.argv.indexOf('--simple-prod-build') > -1 ||
		process.argv.indexOf('--simple-websign-build') > -1 ||
		process.argv.indexOf('--simple-websign-prod-build') > -1
	,
	site: process.argv[(process.argv.indexOf('--site') + 1) || undefined]
};

const baseShellCommandArgs	= process.argv.
	slice(3).
	filter(s => s !== '--background' && s !== '--no-updates')
;

const shellCommandArgs		= baseShellCommandArgs.
	map(s => s.indexOf("'") ? `"${s.replace(/"/g, '\\"')}"` : `'${s}'`).
	join(' ')
;

const isWindows				= process.platform === 'win32';
const agseRemoteAddress		= '10.0.0.42';
const agseLocalAddress		= '10.0.0.43';
const agseRemoteMAC			= '';
const agseLocalInterface	= '';
const agseTempFile			= '';
const commandAdditionalArgs	= [];

const commandScript			=
	fs.existsSync(path.join(__dirname, 'commands', `${args.command}.sh`)) ?
		`${args.command}.sh` :
		fs.existsSync(path.join(__dirname, 'commands', `${args.command}.js`)) ?
			`${args.command}.js` :
			undefined
;

const isAgseDeploy			= false;

const image					= 'cyph/' + (
	spawn('git', ['describe', '--tags', '--exact-match']) ||
	spawn('git', ['branch']).
		split('\n').
		filter(s => s && s.indexOf('*') === 0)[0].
		split(/\s+/)[1]
).toLowerCase();

const mounts				= [
	`${__dirname}:/cyph`
].map(
	s => ['-v', s]
).reduce(
	(a, b) => a.concat(b), []
);

const windowsWorkaround		= !isWindows ? '' : `
	sudo touch /windows
	sudo mv /bin/ln /bin/ln.old
	echo '
		#!/bin/bash

		if [ "\${1}" != '-s' -o "\${#}" != '3' ] ; then
			/bin/ln.old "\${@}"
		elif [ -f "\${2}" ] ; then
			cp -f "\${2}" "\${3}"
		else
			rm -rf "\${3}" 2> /dev/null
			mkdir "\${3}"
			sudo mount --bind "\${2}" "\${3}"
		fi
	' |
		sudo tee -a /bin/ln > /dev/null
	sudo chmod +x /bin/ln
`;

const shellScripts			= {
	agseInit: `
		echo 'Need root for AGSE connection setup.'
		sudo echo

		sudo ipconfig set ${agseLocalInterface} INFORM ${agseLocalAddress} 2> /dev/null
		sleep 1
		sudo ip addr add ${agseLocalAddress} dev ${agseLocalInterface} 2> /dev/null
		sleep 1

		sudo arp -d ${agseRemoteAddress} 2> /dev/null
		sleep 1
		sudo route delete ${agseRemoteAddress} 2> /dev/null
		sleep 1
		sudo route add -host ${agseRemoteAddress} -interface ${agseLocalInterface} 2> /dev/null
		sleep 1
		sudo arp -s ${agseRemoteAddress} ${agseRemoteMAC} 2> /dev/null
		sleep 1
		sudo ip neigh \\
			add ${agseRemoteAddress} \\
			lladdr ${agseRemoteMAC} \\
			dev ${agseLocalInterface} \\
		2> /dev/null
		sleep 1

		sudo bash -c "
			rm '${agseTempFile}' 2> /dev/null
			while [ ! -f '${agseTempFile}' ] ; do sleep 1 ; done
			rm '${agseTempFile}'

			ip addr del ${agseLocalAddress} dev ${agseLocalInterface} 2> /dev/null
			sleep 1
			ipconfig set ${agseLocalInterface} DHCP 2> /dev/null
			sleep 1

			ip link set ${agseLocalInterface} down 2> /dev/null
			sleep 1
			ifconfig ${agseLocalInterface} down 2> /dev/null
			sleep 1

			ip link set ${agseLocalInterface} up 2> /dev/null
			sleep 1
			ifconfig ${agseLocalInterface} up 2> /dev/null
			sleep 1
		" &
	`,
	aptUpdate: {
		command: `
			/cyph/commands/updatedockerimage.sh
		`,
		condition: `
			[ ! -f ~/.updated ] || test "$(find ~/.updated -mtime +3)"
		`
	},
	command: `
		source ~/.bashrc
		${windowsWorkaround}
		/cyph/commands/${commandScript} ${shellCommandArgs}
		notify 'Command complete: ${args.command}' &> /dev/null
	`,
	libUpdate: {
		command: `
			source ~/.bashrc
			${windowsWorkaround}
			/cyph/commands/updatedockerimage.sh
			/cyph/commands/getlibs.sh
		`,
		condition: `
			! cmp /cyph/shared/lib/js/yarn.lock /node_modules/yarn.lock &> /dev/null ||
			! cmp /cyph/shared/node_modules/yarn.lock /node_modules/yarn.lock &> /dev/null
		`
	},
	setup: `
		/cyph/commands/dockerpostmake.sh
		source ~/.bashrc
		notify 'Make complete'
		gcloud init
		echo
		firebase login
	`
};


const backup			= () => {};

const containerName		= command => `${image}_${command}`.replace(/\//g, '_');

const dockerRun			= (command, name, background, noCleanup, additionalArgs, getOutput) => {
	const processArgs	= [
		'run',
		'--privileged',
		getOutput ? '-i' : '-it'
	].concat(
		name ? [`--name=${name}`] : []
	).concat(
		background ? [`-d`] : []
	).concat(
		!noCleanup ? [`--rm=true`] : []
	).concat(
		mounts
	).concat(
		additionalArgs || []
	).concat([
		image,
		'bash',
		'-c',
		command
	]);

	if (getOutput) {
		return spawn('docker', processArgs);
	}
	else {
		return spawnAsync('docker', processArgs);
	}
};

const editImage			= (command, condition, useOriginal) => Promise.resolve().then(() => {
	if (
		condition &&
		dockerRun(
			`if ${condition}\nthen echo dothemove\nfi`,
			undefined,
			undefined,
			undefined,
			undefined,
			true
		) !== 'dothemove'
	) {
		return false;
	}

	const tmpContainer	= containerName('tmp');

	spawn('docker', ['rm', '-f', tmpContainer]);

	return Promise.resolve(
		useOriginal ?
			spawnAsync('docker', ['tag', `${image}_original:latest`, `${image}:latest`]) :
			undefined
	).then(() =>
		dockerRun(command, tmpContainer, undefined, true, ['-p', '9005:9005'])
	).then(() =>
		spawnAsync('docker', ['commit', tmpContainer, image])
	).then(() =>
		spawnAsync('docker', ['rm', '-f', tmpContainer])
	).then(() =>
		spawnAsync('docker', ['system', 'prune', '-f'])
	).then(() =>
		true
	);
});

const killContainer		= name => {
	for (
		const pid of spawn('docker', ['ps', '-a']).
			split('\n').
			slice(1).
			filter(s => s.indexOf(name) > -1).
			map(s => s.split(/\s+/)[0])
	) {
		console.log(spawn('docker', ['kill', '-s', '9', pid]));
		console.log(spawn('docker', ['rm', '-f', pid]));
	}
};

const killEverything	= () => killContainer('cyph');

const pullUpdates		= () => {
	if (args.noUpdates) {
		return Promise.resolve();
	}

	return editImage(
		shellScripts.libUpdate.command,
		shellScripts.libUpdate.condition,
		true
	).then(didUpdate =>
		didUpdate ?
			undefined :
			editImage(shellScripts.aptUpdate.command, shellScripts.aptUpdate.condition)
	).then(() => {
		const libNative	= path.join('shared', 'lib', 'native');
		const ready		= path.join(__dirname, libNative, '.ready');

		if (fs.existsSync(ready)) {
			return;
		}

		console.log(spawn('npm', ['-g', 'update']));
		console.log(spawn('npm', ['-g', 'install', 'nativescript']));
		for (const platform of ['android', 'ios']) {
			spawn('tns', ['platform', 'add', platform], libNative);
		}

		fs.writeFileSync(ready, '');
	});
};

const removeImage		= (name, opts) => {
	for (
		const imageId of spawn('docker', ['images'].concat(opts || [])).
			split('\n').
			slice(1).
			filter(s => name ? s.indexOf(name) > -1 : true).
			map(s => s.split(/\s+/)[2])
	) {
		console.log(spawn('docker', ['rmi', '-f', imageId]));
	}
};

const updateCircleCI	= () => {
	return Promise.resolve();
};


if (isWindows && isAgseDeploy) {
	throw new Error('AGSE not yet supported on Windows.');
}

let exitCleanup	= () => {};
let initPromise	= Promise.resolve();

switch (args.command) {
	case 'certsign':
	case 'deploy':
		if (!isAgseDeploy) {
			break;
		}

		commandAdditionalArgs.push('-p');
		commandAdditionalArgs.push('31337:31337/udp');

		exitCleanup	= () => fs.appendFileSync(agseTempFile);
		initPromise	= runScript(shellScripts.agseInit);
		break;

	case 'editimage':
		editImage(`source ~/.bashrc ; ${baseShellCommandArgs[0]}`);
		break;

	case 'kill':
		killEverything();
		break;

	case 'make':
		killEverything();
		initPromise	= spawnAsync('docker', ['build', '-t', image, '.']).then(() =>
			spawnAsync('docker', ['tag', `${image}:latest`, `${image}_original:latest`])
		).then(() =>
			pullUpdates()
		).then(() =>
			editImage(shellScripts.setup)
		).then(() =>
			spawnAsync('docker', ['tag', `${image}:latest`, `${image}_original:latest`])
		);
		break;

	case 'makeclean':
		killEverything();
		removeImage('cyph');
		removeImage('google/cloud-sdk');
		removeImage(undefined, ['--filter', 'dangling=true']);
		break;

	case 'serve':
		commandAdditionalArgs.push('-p');
		commandAdditionalArgs.push('42000:42000');
		commandAdditionalArgs.push('-p');
		commandAdditionalArgs.push('42001:42001');
		commandAdditionalArgs.push('-p');
		commandAdditionalArgs.push('42002:42002');
		commandAdditionalArgs.push('-p');
		commandAdditionalArgs.push('44000:44000');

		const base		= 'http://localhost';
		const projects	= ['backend', 'cyph.com', 'cyph.ws'];

		for (let i = 0 ; i < projects.length ; ++i) {
			console.log(`${projects[i]}: ${base}:4200${i}`);
		}

		console.log(`docs: ${base}:42001/js/docs/index.html\n\n`);
		break;

	case 'test':
		commandAdditionalArgs.push('-p');
		commandAdditionalArgs.push('9876:9876');
		commandAdditionalArgs.push('-p');
		commandAdditionalArgs.push('42000:42000');
		commandAdditionalArgs.push('-p');
		commandAdditionalArgs.push('42001:42001');
		commandAdditionalArgs.push('-p');
		commandAdditionalArgs.push('42002:42002');
		commandAdditionalArgs.push('-p');
		commandAdditionalArgs.push('44000:44000');
		break;

	case 'updatecircleci':
		updateCircleCI();
		break;

	default:
		if (!commandScript) {
			throw new Error('fak u gooby');
		}
}

process.on('exit', exitCleanup);
process.on('SIGINT', exitCleanup);
process.on('uncaughtException', exitCleanup);

initPromise.then(() => {
	if (!commandScript) {
		return;
	}

	backup();
	killContainer(containerName(args.command));

	pullUpdates().then(() => {
		if (args.command === 'getlibs') {
			return;
		}

		return dockerRun(
			shellScripts.command,
			containerName(args.command),
			args.background,
			false,
			commandAdditionalArgs
		);
	}).then(() => {
		if (args.command === 'updatelibs') {
			updateCircleCI();
		}
	});
});
