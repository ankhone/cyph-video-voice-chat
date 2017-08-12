import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {DeltaStatic} from 'quill';
import {Observable} from 'rxjs';
import {AccountFileRecord, IAccountFileRecord} from '../../proto';
import {LockFunction} from '../lock-function-type';
import {AccountFilesService} from '../services/account-files.service';
import {AccountService} from '../services/account.service';
import {AccountAuthService} from '../services/crypto/account-auth.service';
import {util} from '../util';


/**
 * Angular component for an individual note.
 */
@Component({
	selector: 'cyph-account-note',
	styleUrls: ['../../../css/components/account-note.scss'],
	templateUrl: '../../../templates/account-note.html'
})
export class AccountNoteComponent implements OnInit {
	/** @ignore */
	private readonly saveLock: LockFunction	= util.lockFunction();

	/** Indicates whether or not the edit view should be displayed. */
	public editable: boolean	= false;

	/** Currently active note. */
	public note?: {
		metadata: IAccountFileRecord;
		observable: Observable<DeltaStatic>;
	};

	/** Most recent note data. */
	public noteData?: {
		content: DeltaStatic;
		id: string;
	};

	/** @ignore */
	private setEditable (url: string) : void {
		this.editable	= url.split('/').slice(-1)[0] === 'edit';
	}

	/** @inheritDoc */
	public ngOnInit () : void {
		this.setEditable(this.routerService.url);
		this.routerService.events.subscribe(({url}: any) => {
			if (typeof url === 'string') {
				this.setEditable(url);
			}
		});

		this.activatedRouteService.params.subscribe(async o => {
			try {
				const id: string|undefined	= o.id;

				if (!id) {
					throw new Error('Invalid note ID.');
				}

				await this.accountAuthService.ready;

				const metadata	= await this.accountFilesService.getFile(
					id,
					AccountFileRecord.RecordTypes.Note
				);

				this.note	= {
					metadata,
					observable: this.accountFilesService.watchNote(metadata.id)
				};
			}
			catch (_) {
				this.routerService.navigate(['404']);
			}
		});
	}

	/** Saves note. */
	public saveNote () : void {
		this.saveLock(async () => {
			if (!this.note || !this.noteData || this.note.metadata.id !== this.noteData.id) {
				return;
			}

			await this.accountFilesService.updateNote(this.noteData.id, this.noteData.content);
		});
	}

	constructor (
		/** @ignore */
		private readonly activatedRouteService: ActivatedRoute,

		/** @ignore */
		private readonly routerService: Router,

		/** @ignore */
		private readonly accountAuthService: AccountAuthService,

		/** @see AccountService */
		public readonly accountService: AccountService,

		/** @see AccountFilesService */
		public readonly accountFilesService: AccountFilesService
	) {}
}
