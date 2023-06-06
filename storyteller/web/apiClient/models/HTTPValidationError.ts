/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ValidationError } from './ValidationError.ts';

export type HTTPValidationError = {
    detail?: Array<ValidationError>;
};

