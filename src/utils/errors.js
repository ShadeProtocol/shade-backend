export class AppError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'AppError';
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
