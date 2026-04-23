/**
 * Public surface for the typed-form infrastructure.
 *
 * ─────────────────────────────────────────────────────────────────────
 *  Quick start
 * ─────────────────────────────────────────────────────────────────────
 *
 *   1. Add a Zod schema to `src/lib/validation/input-schemas.ts`.
 *      Input schemas are intentionally separate from the RESPONSE
 *      schemas in `schemas.ts` — inputs are strict (validate what the
 *      user typed), responses are tolerant (backend is authoritative).
 *
 *   2. In the page, call `useZodForm({ schema, defaultValues })`.  The
 *      hook returns a standard `UseFormReturn<TValues>` from react-hook-form,
 *      so anything in the RHF docs works here.
 *
 *   3. Wrap the form with `<FormProvider {...form}>` so the nested
 *      `<FormInput>` / `<FormTextarea>` / `<FormSelect>` helpers can
 *      pull `register()` + validation state from context.
 *
 *   4. Submit with `form.handleSubmit(async (values) => { ... })`.
 *      Zod runs first — your submit callback only fires with valid
 *      data, so you never POST garbage to the backend.
 *
 *   5. On edit, rehydrate the form with `form.reset({...})` inside a
 *      `useEffect` that depends on the fetched record.  Never call
 *      `setValue()` one field at a time for hydration — `reset` is
 *      atomic and clears stale validation errors.
 *
 *   Complete worked example: `src/app/(dashboard)/profiles/[id]/page.tsx`.
 *
 * ─────────────────────────────────────────────────────────────────────
 *  Patterns by form shape
 * ─────────────────────────────────────────────────────────────────────
 *
 *   A. Simple flat form (text + textarea):
 *      → see **Profiles** (`profiles/[id]/page.tsx`)
 *      → use `<FormInput>` and `<FormTextarea>` inside a `<FormProvider>`.
 *
 *   B. Form with boolean toggles, selects, or numeric inputs:
 *      → see **WAF Policies** (`waf-policies/[id]/page.tsx`)
 *      → use `<FormSelect>` for dropdowns.
 *      → use `<Controller>` from `react-hook-form` for checkbox inputs
 *        (the stock `<input type="checkbox">` doesn't fit `register()`
 *        cleanly).
 *      → for numeric `<input type="number">`, the Zod schema should
 *        use `z.coerce.number()` so the string-from-DOM becomes a
 *        number before validation runs.
 *      → fields persisted by the backend but not exposed in the UI
 *        must still be hydrated via `reset({...})` so that `PUT` round-
 *        trips without clobbering server state.
 *
 *   C. Form with a nested array (repeating rows):
 *      → see **Secrets** (`secrets/[id]/page.tsx`)
 *      → destructure `control` from the form, call `useFieldArray({
 *        control, name: "<array-field>" })`.
 *      → render each row with `<FormInput name={`<array>.${idx}.key`}>`
 *        etc. — the dotted path is what RHF uses to address nested
 *        fields, and TypeScript's `Path<TValues>` will type-check it.
 *      → for array-level errors (e.g. a `.refine()` on uniqueness),
 *        read from `formState.errors.<array>.root?.message` — that's
 *        where Zod parks whole-array constraint violations.
 *      → always use `pair.id` (the `useFieldArray` synthetic id) as
 *        the React `key`.  Never use the index — re-ordering breaks
 *        uncontrolled-input state otherwise.
 *
 *   D. Non-standard inputs (code editors, chip pickers, drag-drop lists):
 *      → use `<FormField name={...}>{({ field, error }) => <Widget ... />}</FormField>`.
 *      → the render prop receives `{ value, onChange, onBlur, name, ref }`
 *        plus the flattened `error` string, so any controlled component
 *        plugs in cleanly.
 *
 * ─────────────────────────────────────────────────────────────────────
 *  Tips + gotchas
 * ─────────────────────────────────────────────────────────────────────
 *
 *   • Validation timing.  `useZodForm` defaults to `mode: "onBlur"` +
 *     `reValidateMode: "onChange"`.  That's noisy-free on the first
 *     pass and helpful after a failed submit.  Override via the hook's
 *     options if a specific form benefits from a different cadence.
 *
 *   • Submit button state.  Standard pattern:
 *       `loading={formState.isSubmitting}`
 *       `disabled={!formState.isDirty && !isCreate}`
 *     — disables Save on edit when the user hasn't touched anything.
 *
 *   • Don't mix `register()` and controlled `value`/`onChange` on the
 *     same field.  Pick one.  `register()` (what `<FormInput>` uses)
 *     is faster — it's uncontrolled and doesn't re-render on every
 *     keystroke.  `<Controller>` is needed only for inputs that can't
 *     speak the `register` protocol (custom widgets, checkboxes).
 *
 *   • Preserve round-trip fields.  If the backend persists a field
 *     the UI doesn't expose (e.g. `waf_rules` on a WAF policy), hydrate
 *     it in `reset({...})` anyway — it'll sit in form state and come
 *     back in the submit payload unchanged.
 *
 *   • Remaining forms to migrate (as of this writing): Servers, Rules,
 *     Upstreams, Users, Bookmarks, Instances, WAF Rules.  Pick the
 *     pattern from above that matches the form shape and follow the
 *     referenced worked example.  The Servers and Rules forms are the
 *     most complex — expect a mix of patterns B, C, and D in each.
 */
export { useZodForm, type UseZodFormOptions } from "./useZodForm";
export { default as FormField } from "./FormField";
export { default as FormInput } from "./FormInput";
export { default as FormTextarea } from "./FormTextarea";
export { default as FormSelect } from "./FormSelect";
