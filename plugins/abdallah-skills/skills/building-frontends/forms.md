# Forms

**Every required field is marked with an asterisk on its label** — not in the placeholder,
which vanishes the moment someone types.

```tsx
<FormLabel>
  {t('customers.phone')}
  {required && <span aria-hidden="true" className="ms-0.5 text-destructive">*</span>}
</FormLabel>
```

Three things that keep it correct:

- **`aria-hidden` on the asterisk**, with `required` (or `aria-required`) on the input. The
  asterisk is a visual convention; without this a screen reader announces "star" as if it
  were part of the label, and never says the field is required.
- **`ms-0.5`, not `ml-0.5`** — the asterisk follows the label text in both directions.
- **Never the only signal.** Colour and a glyph both fail someone; the validation message is
  what actually states the requirement.

When most fields in a form are required, invert it — mark the few optional ones instead. A
form where every label carries an asterisk conveys nothing.

**Every input gets a placeholder, and every input keeps its label.** The two do different
jobs: the label names the field, the placeholder shows the shape of a valid answer. A
placeholder disappears on input, so it can never carry the name — the field would lose its
identity exactly when someone is checking what they typed.

So the placeholder never restates the label. `Phone` / `"Phone"` is wasted space;
`Phone` / `"01xxxxxxxxx"` answers the question the label raises.

```tsx
<FormLabel>{t('customers.phone')}<span aria-hidden="true" className="ms-0.5 text-destructive">*</span></FormLabel>
<Input placeholder={t('customers.phonePlaceholder')} {...field} />
```

Placeholders are user-facing strings — they come from the locale files like everything else,
and `en`/`ar` both carry the key. A hardcoded placeholder is the most commonly missed
untranslated string on a screen.

**Prose gets a `<Textarea>`, not an `<Input>`.** Description, notes, address, comment, reason,
message, feedback, instructions — anything written in sentences. A single-line input scrolls
its own text out of view as you type, so the writer can't re-read what they wrote before
submitting, and a long value looks empty from the left edge.

Give it a real starting height, 3–4 rows. The size of the box is how the form says how much
it expects; a one-row textarea is an input with extra steps.

Let it grow with the content or scroll inside itself — never clip.

The inverse holds too: a name, a title, a reference number is an `<Input>`. A textarea there
invites paragraphs into a field the table renders on one line.

Where there is a length limit, show a live counter. A limit the user only discovers by
hitting it is a limit that loses their sentence.

**iOS Safari zooms the page when a focused field's font-size is under 16px** — and it does
not zoom back out on blur, so the whole layout stays scaled and the user has to pinch out.
Applies to `<input>`, `<textarea>`, and `<select>`, in every iOS browser (they all run WebKit).

`text-sm` is 14px, so the default trips it. Fix it on the primitive, once:

```tsx
// components/ui/input.tsx — 16px on mobile, design size from md up where zoom can't happen
className={cn('... text-base md:text-sm', className)}
```

Older shadcn `Input`/`Textarea`/`Select` ship bare `text-sm` — check the primitive before
assuming it's handled.

**Never fix it with the viewport meta.** `maximum-scale=1` or `user-scalable=no` stops the
zoom by disabling pinch-zoom entirely, which fails WCAG 1.4.4 and takes the feature away from
everyone who relies on it.

**Number inputs ship with no spin buttons, and the wheel must not change their value.** The
arrows are a tiny hit target nobody uses, and scrolling past a focused number field silently
edits it — the user sees a changed quantity or price they never typed. Fix both on the
primitive:

```tsx
// components/ui/input.tsx
className={cn(
  '... [appearance:textfield]',
  '[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
  className,
)}
onWheel={(e) => e.currentTarget.blur()}
```

`onWheel` blurs rather than calling `preventDefault()` because React attaches wheel listeners
passively at the root — `preventDefault()` there is ignored, which is why the obvious fix
looks like it works and doesn't. Blurring hands the scroll back to the page.

Keyboard ↑/↓ still step the value while focused; that one is fine, since it is deliberate.

For anything that isn't really a spinnable quantity — a phone number, an OTP, an ID, a card
number — prefer `type="text"` with `inputMode="numeric"`. It gets the mobile numeric keypad
without inheriting any of `type="number"`'s behaviour, and unlike `type="number"` it respects
`maxLength`.

## Formatted numbers

Any number read as a quantity — money, counts, distances — is displayed **grouped**:
`100,000`, never `100000`. Ungrouped digits make the reader count places to know whether
it's ten thousand or a hundred thousand, and that is exactly the mistake that matters on a
price field.

Two values exist at all times, and they must not be confused:

| | holds | example |
|---|---|---|
| form state | a `number` | `100000` |
| the input | a `string` | `"100,000"` |

**Never store or submit the formatted string.** Strip separators before it leaves the field.

`type="number"` cannot do this at all — the browser rejects a value containing commas — so a
formatted number field is `type="text"` with `inputMode="numeric"`, which is where it wanted
to be anyway.

**Format on blur, keep it raw while focused.** Reformatting on every keystroke moves the
caret: type `1000`, the field becomes `1,000`, and the cursor jumps to the end mid-number.
Formatting only on blur removes that whole class of bug without any caret bookkeeping.

```tsx
// Grouping only — digits stay Latin so the field is typable under `ar`.
const nf = new Intl.NumberFormat('en-US')

export function NumberInput({ value, onChange, ...props }: NumberInputProps) {
  const [text, setText] = useState(value == null ? '' : nf.format(value))
  const [focused, setFocused] = useState(false)

  // Re-sync when the form changes the value from outside (reset, defaults).
  useEffect(() => {
    if (!focused) setText(value == null ? '' : nf.format(value))
  }, [value, focused])

  return (
    <Input
      inputMode="numeric"
      value={text}
      onFocus={() => { setFocused(true); setText(value == null ? '' : String(value)) }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.-]/g, '')   // separators out
        setText(raw)
        onChange(raw === '' ? null : Number(raw))             // form gets a number
      }}
      onBlur={() => { setFocused(false); setText(value == null ? '' : nf.format(value)) }}
      {...props}
    />
  )
}
```

**Keep the digits Latin.** `new Intl.NumberFormat('ar')` renders Arabic-Indic numerals
(`١٠٠٬٠٠٠`), which nobody types on a normal keyboard. Group with `en-US`, or use
`ar-EG-u-nu-latn` if you want Arabic locale rules with Latin digits. Display-only text can
use whatever the design calls for; an editable field should show what the user will type.

**Read-only views use the same formatter.** If a table shows `100,000` and the edit field
shows `100000`, the value appears to change when you click edit.

Money keeps its decimals — `minimumFractionDigits: 2` — so `1200` renders `1,200.00` and
doesn't look like a different figure from the invoice beside it.
