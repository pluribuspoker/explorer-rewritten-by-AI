import { TAG } from './config.js'
export const log = (...a) => console.log(TAG, ...a)
export const warn = (...a) => console.warn(TAG, ...a)
export const err = (...a) => console.error(TAG, ...a)
