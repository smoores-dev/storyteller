/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Body_upload_audio_book__id__audio_post } from '../models/Body_upload_audio_book__id__audio_post.ts';
import type { Body_upload_epub_book_epub_post } from '../models/Body_upload_epub_book_epub_post.ts';

import type { CancelablePromise } from '../core/CancelablePromise.ts';
import type { BaseHttpRequest } from '../core/BaseHttpRequest.ts';

export class DefaultService {

    constructor(public readonly httpRequest: BaseHttpRequest) {}

    /**
     * Index
     * @returns any Successful Response
     * @throws ApiError
     */
    public indexGet(): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/',
        });
    }

    /**
     * Upload Epub
     * @param formData
     * @returns any Successful Response
     * @throws ApiError
     */
    public uploadEpubBookEpubPost(
        formData: Body_upload_epub_book_epub_post,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/book/epub',
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Upload Audio
     * @param id
     * @param formData
     * @returns any Successful Response
     * @throws ApiError
     */
    public uploadAudioBookIdAudioPost(
        id: number,
        formData: Body_upload_audio_book__id__audio_post,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/book/{id}/audio',
            path: {
                'id': id,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
