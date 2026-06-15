export type AppError<
    TTag extends string = string,
    TData extends Record<string, unknown> = Record<string, unknown>,
> = Error &
    Readonly<
        {
            _tag: TTag;
            message: string;
            cause?: unknown;
        } & TData
    >;

export const createAppError = <TTag extends string, TData extends Record<string, unknown> = Record<string, unknown>>(
    tag: TTag,
    message: string,
    data?: TData,
    cause?: unknown
): AppError<TTag, TData> => {
    // `data` is applied before the reserved keys so a stray `data.message`/`data._tag` can never
    // shadow the real discriminant or message.
    const error = Object.assign(new Error(message), data ?? {}, { _tag: tag, message }) as AppError<TTag, TData>;
    if (cause !== undefined) {
        Object.defineProperty(error, 'cause', { value: cause, writable: true, enumerable: false, configurable: true });
    }
    return error;
};
