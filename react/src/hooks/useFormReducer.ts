import { Reducer, useReducer } from 'react';

export type FormState<S> = { [K in keyof S]: { value: S[K]; error: string } };

interface RuleFunc<S> {
    (state: FormState<S>, value: any): boolean;
}

interface RequiredFunc<S> {
    (state: FormState<S>): boolean;
}
interface Rule<S> {
    displayError?: boolean;
    valid: RuleFunc<S>;
    error: string;
}

export type Validator<S> = {
    [K in keyof S]?: {
        required?: boolean | RequiredFunc<S>;
        displayRequiredError?: boolean;
        rules?: Rule<S>[];
    };
};

interface Error {
    displayError: boolean;
    errorText: string;
}

const makeFreshState = <S>(state: S): FormState<S> =>
    Object.entries(state)
        .map(([k, v]: [string, keyof S]) => ({ [k]: { value: v, error: '' } }))
        .reduce((a, c) => ({ ...a, ...c }), {} as FormState<S>);

const useFormReducer = <S>(initialState: S, Validator?: Validator<S>) => {
    const stateWithErrorFields = makeFreshState(initialState);

    const [state, dispatch] = useReducer<Reducer<FormState<S>, any>>(
        makeReducer(Validator),
        stateWithErrorFields as FormState<S>
    );

    return [
        state,
        (values: Partial<S>) => dispatch({ type: 'update', payload: values }),
        () => dispatch({ type: 'reset', payload: initialState }),
    ] as const;
};

const makeReducer =
    <S>(validator?: Validator<S>) =>
    <R extends FormState<S>, A extends { type: string; payload: Partial<S> }>(
        state: R,
        action: A
    ) => {
        switch (action.type) {
            case 'update':
                const newFields = action.payload;
                const newState = Object.keys(state).reduce(
                    (acc, k) => ({
                        ...acc,
                        [k]: {
                            ...state[k as keyof S],
                            value:
                                k in newFields
                                    ? newFields[k as keyof S]
                                    : state[k as keyof S].value,
                        },
                    }),
                    {} as FormState<S>
                );
                return setErrors(newState, validator);
            case 'reset':
                return makeFreshState(action.payload as S);
            default:
                return state;
        }
    };

const getFieldRequired = <S extends {}>(
    state: FormState<S>,
    fieldName: keyof S,
    validator: Validator<S>
) => {
    const required = validator[fieldName]?.required!;
    let isRequired = false;
    if (typeof required === 'function' && required(state)) {
        isRequired = true;
    }
    if (typeof required === 'boolean' && required) {
        isRequired = true;
    }
    return isRequired;
};

const validateField = <S>(
    state: FormState<S>,
    validator: Validator<S> | undefined,
    field: keyof S,
    value: S[keyof S] | undefined
): Error | null => {
    if (!validator || !validator[field]) {
        return null;
    }
    if (!!validator[field]?.required) {
        const required = getFieldRequired(state, field, validator);
        if (required && !value) {
            return {
                displayError: !!validator[field]?.displayRequiredError,
                errorText: `${field} is required!`,
            };
        }
    }
    let error: Error | null = null;
    if (validator[field]?.rules !== undefined) {
        for (let rule of validator[field]!.rules!) {
            if (!rule.valid(state, value) && getFieldRequired(state, field, validator)) {
                const { displayError = true, error: errorText } = rule;
                error = {
                    displayError,
                    errorText,
                };
                break;
            }
        }
    }
    return error;
};

export const setErrors = <S>(form: FormState<S>, validator?: Validator<S>) => {
    for (let field in form) {
        const fieldValidation = validateField(form, validator, field, form[field].value);
        form[field]['error'] = !!fieldValidation?.displayError ? fieldValidation.errorText : '';
    }
    return form;
};

export const formIsValid = <S>(form: FormState<S>, validator: Validator<S>) => {
    let error;
    for (let field in form) {
        error = validateField(form, validator, field, form[field].value)?.errorText;
        if (error) break;
    }
    return !!error ? false : true;
};

export default useFormReducer;
