export interface Client {
	id: string;
	name: string;
	email: string;
	totalBackups: number;
	uniqueBackupNames: number;
	totalSize: string;
	lastBackupDate: string | null;
}

export interface GroupedBackup {
	backupName: string;
	totalBackups: number;
	totalSize: string;
	latestBackup: {
		id: string;
		version: number;
		status: string;
		createdAt: string;
		filesCount: number;
		totalSize: string;
	} | null;
}

export interface BackupDetail {
	id: string;
	zipName?: string;
	backupName: string;
	version: number;
	status: string;
	filesCount: number;
	totalSize: string;
	createdAt: string;
	client: {
		id: string;
		name: string;
		email: string;
	};
}

export interface ClientState {
	connected: boolean;
	activeBackup: {
		backupName: string;
		status: string;
		progress: number;
		description: string;
	} | null;
	lastError: {
		backupName: string;
		message: string;
		date: string;
	} | null;
	lastCompleted: {
		backupName: string;
		date: string;
	} | null;
}
