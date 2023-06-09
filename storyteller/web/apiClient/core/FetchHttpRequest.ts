/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiRequestOptions } from './ApiRequestOptions.ts.ts';
import { BaseHttpRequest } from './BaseHttpRequest.ts.ts';
import type { CancelablePromise } from './CancelablePromise.ts.ts';
import type { OpenAPIConfig } from './OpenAPI.ts.ts';
import { request as __request } from './request.ts.ts';

export class FetchHttpRequest extends BaseHttpRequest {

    constructor(config: OpenAPIConfig) {
        super(config);
    }

    /**
     * Request method
     * @param options The request options from the service
     * @returns CancelablePromise<T>
     * @throws ApiError
     */
    public override request<T>(options: ApiRequestOptions): CancelablePromise<T> {
        return __request(this.config, options);
    }
}
