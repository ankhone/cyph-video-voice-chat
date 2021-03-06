import {
	ChangeDetectionStrategy,
	Component,
	Input,
	ViewChild
} from '@angular/core';
import {MatPaginator, MatSort, MatTableDataSource} from '@angular/material';
import memoize from 'lodash-es/memoize';
import {BaseProvider} from '../../base-provider';
import {
	AccountFileRecord,
	IAccountFileRecord,
	IAccountFileReference,
	IEhrApiKey
} from '../../proto';
import {AccountContactsService} from '../../services/account-contacts.service';
import {AccountFilesService} from '../../services/account-files.service';
import {AccountService} from '../../services/account.service';
import {AccountAuthService} from '../../services/crypto/account-auth.service';
import {AccountDatabaseService} from '../../services/crypto/account-database.service';
import {DialogService} from '../../services/dialog.service';
import {EHRIntegrationService} from '../../services/ehr-integration.service';
import {EnvService} from '../../services/env.service';
import {StringsService} from '../../services/strings.service';
import {trackByID} from '../../track-by/track-by-id';
import {readableByteLength} from '../../util/formatting';
import {getDateTimeString, watchRelativeDateString} from '../../util/time';
import {waitForValue} from '../../util/wait';

/**
 * Angular component for "file" list UI.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'cyph-account-base-file-list',
	styleUrls: ['./account-base-file-list.component.scss'],
	templateUrl: './account-base-file-list.component.html'
})
export class AccountBaseFileListComponent extends BaseProvider {
	/** @see getDateTimeString */
	public readonly getDateTimeString = getDateTimeString;

	/** Gets table columns. */
	public readonly getTableColumns = memoize(
		(recordType: AccountFileRecord.RecordTypes) => [
			'type',
			'name',
			'timestamp',
			...(recordType === AccountFileRecord.RecordTypes.File ?
				['size'] :
				[]),
			'owner',
			'actions'
		]
	);

	/** Gets table data source. */
	public readonly getTableDataSource = memoize(
		(
			data: {
				data: any;
				owner: string;
				record: IAccountFileRecord;
			}[]
		) => {
			const dataSource = new MatTableDataSource(data);

			Promise.all([
				waitForValue(() => this.paginator),
				waitForValue(() => this.sort)
			]).then(([paginator, sort]) => {
				dataSource.paginator = paginator;
				dataSource.sort = sort;
			});

			return dataSource;
		}
	);

	/** @see MatPaginator */
	@ViewChild(MatPaginator, {static: false}) public paginator?: MatPaginator;

	/** @see readableByteLength */
	public readonly readableByteLength = readableByteLength;

	/** @see AccountFileRecord.RecordTypes */
	@Input() public recordType: AccountFileRecord.RecordTypes =
		AccountFileRecord.RecordTypes.File;

	/** @see AccountFileRecord.RecordTypes */
	public readonly recordTypes = AccountFileRecord.RecordTypes;

	/** @see MatSort */
	@ViewChild(MatSort, {static: false}) public sort?: MatSort;

	/** @see trackByID */
	public readonly trackByID = trackByID;

	/** @see watchRelativeDateString */
	public readonly watchRelativeDateString = watchRelativeDateString;

	/** Accepts incoming EHR API key. */
	public async acceptEhrApiKey (
		record: IAccountFileRecord & IAccountFileReference
	) : Promise<void> {
		await this.accountFilesService.acceptIncomingFile(record, {
			copy: true,
			name: !record.wasAnonymousShare ?
				record.owner :
				getDateTimeString(record.timestamp)
		});
	}

	/** Removes an EHR API key. */
	public async removeEhrApiKey (o: {
		data: IEhrApiKey;
		record: IAccountFileRecord & IAccountFileReference;
	}) : Promise<void> {
		await Promise.all([
			this.accountFilesService.remove(o.record),
			o.record.metadata ?
				this.ehrIntegrationService.deleteApiKey(
					o.data.apiKey,
					o.record.metadata
				) :
				undefined
		]);
	}

	/** Creates and shares new EHR API key. */
	public async shareEhrApiKey (o: {
		data: IEhrApiKey;
		record: IAccountFileRecord & IAccountFileReference;
	}) : Promise<void> {
		await this.accountFilesService.shareFilePrompt(async username => ({
			data: {
				apiKey: await this.ehrIntegrationService.generateApiKey(
					username,
					o.data.apiKey
				),
				isMaster: false
			},
			metadata: o.data.apiKey,
			name: username
		}));
	}

	constructor (
		/** @ignore */
		public readonly ehrIntegrationService: EHRIntegrationService,

		/** @see AccountService */
		public readonly accountService: AccountService,

		/** @see AccountAuthService */
		public readonly accountAuthService: AccountAuthService,

		/** @see AccountContactsService */
		public readonly accountContactsService: AccountContactsService,

		/** @see AccountDatabaseService */
		public readonly accountDatabaseService: AccountDatabaseService,

		/** @see AccountFilesService */
		public readonly accountFilesService: AccountFilesService,

		/** @see DialogService */
		public readonly dialogService: DialogService,

		/** @see EnvService */
		public readonly envService: EnvService,

		/** @see StringsService */
		public readonly stringsService: StringsService
	) {
		super();
	}
}
