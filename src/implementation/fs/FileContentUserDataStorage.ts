import path from 'path';
import { getAllFiles } from 'get-all-files';
import { readFile, rm, writeFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

import {
    ContentId,
    IContentUserData,
    IContentUserDataStorage,
    IFinishedUserData,
    IUser
} from '../../types';
import Logger from '../../helpers/Logger';
import { checkFilename, sanitizeFilename } from './filenameUtils';

const log = new Logger('FileContentUserDataStorage');

/**
 * Saves user data in JSON files on the disk. It creates one file per content
 * object. There's a separate file for user states and one for the finished data.
 * Each file contains a list of all states or finished data objects.
 */
export default class FileContentUserDataStorage
    implements IContentUserDataStorage
{
    constructor(protected directory: string) {
        if (!existsSync(directory)) {
            log.debug('Creating directory', directory);
            mkdirSync(directory, { recursive: true });
        }
    }

    public async getContentUserData(
        contentId: ContentId,
        dataType: string,
        subContentId: string,
        userId: string,
        contextId?: string
    ): Promise<IContentUserData> {
        const file = this.getSafeUserDataFilePath(contentId);
        let dataList: IContentUserData[];
        try {
            dataList = JSON.parse(await readFile(file, 'utf-8'));
        } catch (error) {
            log.error(
                'getContentUserData',
                'Error reading file',
                file,
                'Error:',
                error
            );
            return null;
        }
        try {
            return (
                dataList.find(
                    (data) =>
                        data.dataType === dataType &&
                        data.subContentId === subContentId &&
                        data.userId === userId &&
                        data.contextId === contextId
                ) || null
            );
        } catch (error) {
            log.error(
                'getContentUserData',
                'Corrupt file',
                file,
                'Error:',
                error
            );
            return null;
        }
    }

    public async getContentUserDataByUser(
        user: IUser
    ): Promise<IContentUserData[]> {
        const files = await getAllFiles(this.directory).toArray();
        const result: IContentUserData[] = [];
        for (const file of files) {
            if (!file.endsWith('-userdata.json')) {
                continue;
            }
            let data: IContentUserData[];
            try {
                data = JSON.parse(await readFile(file, 'utf-8'));
            } catch (error) {
                log.error(
                    'getContentUserDataByUser',
                    'Error reading file',
                    file,
                    'Error:',
                    error,
                    'Data in the corrupt file is not part of the list'
                );
            }
            try {
                for (const entry of data) {
                    if (entry.userId === user.id) {
                        result.push(entry);
                    }
                }
            } catch (error) {
                log.error(
                    'getContentUserDataByUser',
                    'Error going through data in file',
                    file,
                    'Error:',
                    error
                );
            }
        }
        return result;
    }

    public async createOrUpdateContentUserData(
        userData: IContentUserData
    ): Promise<void> {
        const filename = this.getSafeUserDataFilePath(userData.contentId);
        let oldData: IContentUserData[];
        try {
            oldData = JSON.parse(await readFile(filename, 'utf-8'));
        } catch (error) {
            log.debug(
                'createOrUpdateContentUserData',
                'Error while reading user data file for contentId',
                userData.contentId,
                '(error:',
                error,
                '). Seeding with empty list.'
            );
            oldData = [];
        }

        // make sure we have only one entry for contentId, dataType,
        // subContentId, user and contextId
        const newUserData = oldData.filter(
            (data) =>
                data.contentId !== userData.contentId ||
                data.dataType !== userData.dataType ||
                data.subContentId !== userData.subContentId ||
                data.userId !== userData.userId ||
                data.contextId !== userData.contextId
        );

        newUserData.push(userData);
        try {
            await writeFile(filename, JSON.stringify(newUserData));
        } catch (error) {
            log.error(
                'createOrUpdateContentUserData',
                'Error while writing user data to file for contentId',
                userData.contentId,
                'Error:',
                error
            );
        }
    }

    public async deleteInvalidatedContentUserData(
        contentId: string
    ): Promise<void> {
        const filename = this.getSafeUserDataFilePath(contentId);
        let oldData: IContentUserData[];
        try {
            oldData = JSON.parse(await readFile(filename, 'utf-8'));
        } catch (error) {
            log.debug(
                'deleteInvalidatedContentUserData',
                'Error while reading user data file for contentId',
                contentId,
                '(error:',
                error,
                '). Seeding with empty list.'
            );
            oldData = [];
        }

        // make sure we have only one entry for contentId, dataType, subContentId and user
        const newUserData = oldData.filter(
            (data) => data.contentId !== contentId || !data.invalidate
        );

        try {
            await writeFile(filename, JSON.stringify(newUserData));
        } catch (error) {
            log.error(
                'deleteInvalidatedContentUserData',
                'Error while writing user data to file for contentId',
                contentId,
                'Error:',
                error
            );
        }
    }

    public async deleteAllContentUserDataByUser(user: IUser): Promise<void> {
        const files = await getAllFiles(this.directory).toArray();
        for (const file of files) {
            if (!file.endsWith('-userdata.json')) {
                continue;
            }
            let data: IContentUserData[];
            try {
                data = JSON.parse(await readFile(file, 'utf-8'));
            } catch (error) {
                log.error(
                    'deleteAllContentUserDataByUser',
                    'Error reading file',
                    file,
                    'Error:',
                    error,
                    'Data in the corrupt file is not part of the list'
                );
            }
            let newData: IContentUserData[];
            try {
                newData = data?.filter((d) => d.userId !== user.id);
            } catch (error) {
                log.error(
                    'deleteAllContentUserDataByUser',
                    'Error going through data in file',
                    file,
                    'Error:',
                    error
                );
            }
            if (newData) {
                try {
                    await writeFile(file, JSON.stringify(newData));
                } catch (error) {
                    log.error(
                        'deleteAllContentUserDataByUser',
                        'Error writing data to file',
                        file,
                        'Error:',
                        error
                    );
                }
            }
        }
    }

    public async deleteAllContentUserDataByContentId(
        contentId: ContentId
    ): Promise<void> {
        const file = this.getSafeUserDataFilePath(contentId);
        try {
            await rm(file, { recursive: true, force: true });
        } catch (error) {
            log.error(
                'deleteAllContentUserDataByContentId',
                'Could not delete file',
                file,
                'Error:',
                error
            );
        }
    }

    public async getContentUserDataByContentIdAndUser(
        contentId: ContentId,
        userId: string,
        contextId?: string
    ): Promise<IContentUserData[]> {
        const file = this.getSafeUserDataFilePath(contentId);
        let dataList: IContentUserData[];
        try {
            dataList = JSON.parse(await readFile(file, 'utf-8'));
        } catch (error) {
            log.error(
                'getContentUserDataByContentIdAndUser',
                'Error reading file',
                file,
                'Error:',
                error
            );
            return [];
        }

        try {
            return dataList.filter(
                (data) => data.userId === userId && data.contextId == contextId
            );
        } catch (error) {
            log.error(
                'getContentUserDataByContentIdAndUser',
                'Corrupt file',
                file
            );
            return [];
        }
    }

    public async createOrUpdateFinishedData(
        finishedData: IFinishedUserData
    ): Promise<void> {
        const filename = this.getSafeFinishedFilePath(finishedData.contentId);
        let oldData: IFinishedUserData[];
        try {
            oldData = JSON.parse(await readFile(filename, 'utf-8'));
        } catch (error) {
            log.debug(
                'createOrUpdateFinishedData',
                'Error while reading finished file for contentId',
                finishedData.contentId,
                '(error:',
                error,
                '). Seeding with empty list.'
            );
            oldData = [];
        }

        // make sure we have only one entry for user
        const newData = oldData.filter(
            (data) => data.userId !== finishedData.userId
        );

        newData.push(finishedData);

        try {
            await writeFile(filename, JSON.stringify(newData));
        } catch (error) {
            log.error(
                'createOrUpdateFinishedData',
                'Error while writing finished data to file for contentId',
                finishedData.contentId,
                'Error:',
                error
            );
        }
    }

    public async getFinishedDataByContentId(
        contentId: string
    ): Promise<IFinishedUserData[]> {
        const file = this.getSafeFinishedFilePath(contentId);
        let finishedList: IFinishedUserData[];
        try {
            finishedList = JSON.parse(await readFile(file, 'utf-8'));
        } catch (error) {
            log.error(
                'getFinishedDataByContentId',
                'Error reading file',
                file,
                'Error:',
                error
            );
            return undefined;
        }

        if (Array.isArray(finishedList)) {
            return finishedList;
        } else {
            log.error('getFinishedDataByContentId', 'Corrupt file', file);
            return [];
        }
    }

    public async getFinishedDataByUser(
        user: IUser
    ): Promise<IFinishedUserData[]> {
        const files = await getAllFiles(this.directory).toArray();
        const result: IFinishedUserData[] = [];
        for (const file of files) {
            if (!file.endsWith('-finished.json')) {
                continue;
            }
            let data: IFinishedUserData[];
            try {
                data = JSON.parse(await readFile(file, 'utf-8'));
            } catch (error) {
                log.error(
                    'getFinishedDataByUser',
                    'Error reading file',
                    file,
                    'Error:',
                    error,
                    'Data in the corrupt file is not part of the list'
                );
            }
            try {
                for (const entry of data) {
                    if (entry.userId === user.id) {
                        result.push(entry);
                    }
                }
            } catch (error) {
                log.error(
                    'getFinishedDataByUser',
                    'Error going through data in file',
                    file,
                    'Error:',
                    error
                );
            }
        }
        return result;
    }

    public async deleteFinishedDataByContentId(
        contentId: string
    ): Promise<void> {
        const file = this.getSafeFinishedFilePath(contentId);
        try {
            await rm(file, { recursive: true, force: true });
        } catch (error) {
            log.error(
                'deleteFinishedDataByContentId',
                'Could not delete file',
                file,
                'Error:',
                error
            );
        }
    }

    public async deleteFinishedDataByUser(user: IUser): Promise<void> {
        const files = await getAllFiles(this.directory).toArray();
        for (const file of files) {
            if (!file.endsWith('-finished.json')) {
                continue;
            }
            let data: IFinishedUserData[];
            try {
                data = JSON.parse(await readFile(file, 'utf-8'));
            } catch (error) {
                log.error(
                    'deleteFinishedDataByUser',
                    'Error reading file',
                    file,
                    'Error:',
                    error,
                    'Data in the corrupt file is not part of the list'
                );
            }
            let newData: IFinishedUserData[];
            try {
                newData = data?.filter((d) => d.userId !== user.id);
            } catch (error) {
                log.error(
                    'deleteFinishedDataByUser',
                    'Error going through data in file',
                    file,
                    'Error:',
                    error
                );
            }
            if (newData) {
                try {
                    await writeFile(file, JSON.stringify(newData));
                } catch (error) {
                    log.error(
                        'deleteFinishedDataByUser',
                        'Error writing data to file',
                        file,
                        'Error:',
                        error
                    );
                }
            }
        }
    }

    private getSafeUserDataFilePath(contentId: string): string {
        checkFilename(contentId);
        return path.join(
            this.directory,
            sanitizeFilename(
                `${contentId}-userdata.json`,
                80,
                /[^A-Za-z0-9\-._]/g
            )
        );
    }

    private getSafeFinishedFilePath(contentId: string): string {
        checkFilename(contentId);
        return path.join(
            this.directory,
            sanitizeFilename(
                `${contentId}-finished.json`,
                80,
                /[^A-Za-z0-9\-._]/g
            )
        );
    }
}
