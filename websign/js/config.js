var config	= {
	abortText: 'Loading Cyph failed. Please try again later.',
	cdnUrlBase: '.cdn.cyph.com/',
	cdnUrlBaseOnion: 'cdn.cyphdbyhiddenbhs.onion/',
	continentUrl: 'https://api.cyph.com/continent',
	defaultContinent: 'eu',

	cyphBranches: [
		'beta',
		'master',
		'staging'
	],

	files: [
		'/',
		'/appcache.appcache',
		'/manifest.json',
		'/serviceworker.js',
		'/unsupportedbrowser'
	],

	publicKeys: PUBLIC_KEYS
};
