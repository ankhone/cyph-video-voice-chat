import {Observable} from 'rxjs';
import {User} from './user';

/** Type representing either a User object or something similar. */
export type UserLike =
	| {
			anonymous: true;
			avatar: undefined;
			contactID: undefined;
			name: undefined;
			pseudoAccount: false;
			username: undefined;
	  }
	| {
			anonymous: false;
			avatar: undefined;
			contactID: Promise<string>;
			name: Observable<string>;
			pseudoAccount: true;
			username: string;
	  }
	| User;
