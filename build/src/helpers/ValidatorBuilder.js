"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidatorBuilder = void 0;
exports.throwErrorsNowRule = throwErrorsNowRule;
const AggregateH5pError_1 = __importDefault(require("./AggregateH5pError"));
/**
 * A ValidatorBuilder can be used to chain validation rules by calling
 * addRule(...) multiple times and by starting the validation by calling
 * validate(...). The ValidatorBuilder then calls each rule in the order they
 * were added.
 *
 * Each validation rule is a function that requires two parameters:
 *   - a content object
 *   - an error object
 *
 * The content object contains the content that should be validated. Typically
 * this content object is also returned by the validation rule as it is passed
 * on as the first paramter to the next rule. In some cases rules can return a
 * different (or mutated) content object if transformations are necessary.
 *
 * The error object is of type ValidationError and is used to report back errors
 * to the caller of validate. (Every call to validate should be wrapped in a
 * try-catch block). To cover cases in which the validation process doesn't have
 * to be interrupted if there is a validation error the rule can call
 * error.addError(...) to append another error message to the error object. The
 * error object has to be thrown later, e.g. by adding the throwErrorsNowRule to
 * the builder. If validation needs to be stopped right away, the rule function
 * should throw the error object passed to it (it should not create a new error
 * object because there might be other messages in the error object already).
 */
class ValidatorBuilder {
    constructor() {
        this.rules = [];
    }
    rules;
    /**
     * Adds a rule to the validator. Chain this method together to create
     * complex validators.
     * @param rule rule to add
     * @returns
     */
    addRule(rule) {
        this.rules.push(rule);
        return this;
    }
    /**
     * Adds a rule to the validator if the condition is met. Chain this method
     * together to create complex validators.
     * @param rule rule to add
     * @param condition the condition (rule is added if it is true)
     * @returns
     */
    addRuleWhen(rule, condition) {
        if (condition) {
            return this.addRule(rule);
        }
        return this;
    }
    /**
     * Executes the validation.
     * @param data The data to validate. This parameters is passed to the first
     * rule as the first parameter.
     * @param error an optional error object. A new one is created if none is
     * passed in here.
     * @returns Returns the object that is returned by the last rule if
     * everything is valid or throws a ValidationError if not
     */
    async validate(data, pathPrefix, error = new AggregateH5pError_1.default('package-validation-failed', {}, 400, undefined, 'VALIDATION_FAILED')) {
        let returnValue = data;
        for (const rule of this.rules) {
            // promises need to be called iteratively here as validation has to
            // occur step by step
            // eslint-disable-next-line no-await-in-loop
            returnValue = await rule(returnValue, pathPrefix, error);
            if (returnValue === undefined) {
                // An undefined return value means that the validation should be
                // aborted because it's not necessary (e.g. because it would be
                // redundant to validate an already installed library)
                break;
            }
        }
        return returnValue;
    }
}
exports.ValidatorBuilder = ValidatorBuilder;
/**
 * This rule throws the ValidationError object passed to it if there are any
 * messages in it.
 * @param data The data (ignored by this rule)
 * @param error The error to throw if there are any
 * @returns the unchanged data object
 */
function throwErrorsNowRule(data, pathPrefix, error) {
    if (error.hasErrors()) {
        throw error;
    }
    return data;
}
//# sourceMappingURL=ValidatorBuilder.js.map