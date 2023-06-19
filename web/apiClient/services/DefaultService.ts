/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Body_upload_audio_books__book_id__audio_post } from '../models/Body_upload_audio_books__book_id__audio_post';
import type { Body_upload_epub_books_epub_post } from '../models/Body_upload_epub_books_epub_post';
import type { BookDetail } from '../models/BookDetail';

import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';

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
     * List Books
     * @returns BookDetail Successful Response
     * @throws ApiError
     */
    public listBooksBooksGet(): CancelablePromise<Array<BookDetail>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/books',
        });
    }

    /**
     * Upload Epub
     * @param formData
     * @returns BookDetail Successful Response
     * @throws ApiError
     */
    public uploadEpubBooksEpubPost(
        formData: Body_upload_epub_books_epub_post,
    ): CancelablePromise<BookDetail> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/books/epub',
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Upload Audio
     * @param bookId
     * @param formData
     * @returns any Successful Response
     * @throws ApiError
     */
    public uploadAudioBooksBookIdAudioPost(
        bookId: number,
        formData: Body_upload_audio_books__book_id__audio_post,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/books/{book_id}/audio',
            path: {
                'book_id': bookId,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Process Book
     * @param bookId
     * @returns any Successful Response
     * @throws ApiError
     */
    public processBookBooksBookIdProcessPost(
        bookId: number,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/books/{book_id}/process',
            path: {
                'book_id': bookId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
