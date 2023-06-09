/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiRequestOptions } from './ApiRequestOptions.ts.ts';
import type { CancelablePromise } from './CancelablePromise.ts.ts';
import type { OpenAPIConfig } from './OpenAPI.ts.ts';

export abstract class BaseHttpRequest {

    constructor(public readonly config: OpenAPIConfig) {}

    public abstract request<T>(options: ApiRequestOptions): CancelablePromise<T>;
}
