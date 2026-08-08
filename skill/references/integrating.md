# One complete round trip

The same program in three languages: restore the registry, mint identifiers
bound to a context, build a prompt that carries them, extract them from the
model's reply, resolve each one, and act on the three outcomes.

The reply here is a fixture with one substituted symbol in it, so the repair
path runs every time. In a real system it is whatever the model returned.

Each program stores the context beside the identifier, because the registry does
not carry it. Each one treats a repair as a signal rather than a non-event. And
each one has somewhere for failure to go.

## PHP

```php
<?php

require 'vendor/autoload.php';

use LLMUID\LLMUID;

const PATTERN = '/\b[0-9BCDFGHJKMNPQRSTVWXZ]{2}(?:-[0-9BCDFGHJKMNPQRSTVWXZ]{2}){4}\b/';

//
// The registry is append-only and lives in the object, so it is restored from
// storage on the way in and persisted on the way out. Everything ever issued
// goes back in, not just what is still active: minting scans it to enforce
// separation, and a retired identifier still has to resolve.
//
$stored   = file_exists('registry.json') ? json_decode(file_get_contents('registry.json'), TRUE) : array();
$llmuid   = new LLMUID($stored);
$invoices = array();

//
// Mint one identifier per invoice, bound to the context 'invoice'. The context
// is stored beside the identifier because it is not part of it and cannot be
// recovered from it later.
//
foreach (array('Acme', 'Globex') as $customer) {
    $identifier = $llmuid->mint('invoice');

    if (FALSE === $identifier) {
        //
        // A failed mint means the random source is degenerate, not that the
        // space is exhausted. There is nothing to retry against.
        //
        fwrite(STDERR, 'Could not mint: ' . $llmuid->last_error() . "\n");

        exit(1);
    }

    $invoices[$identifier] = array('customer' => $customer, 'context' => 'invoice');
}

file_put_contents('registry.json', json_encode($llmuid->registry()));

//
// The write path. Canonical rendering, wrapped in backticks so the model reads
// them as opaque literals, and a standing instruction in every prompt that
// carries identifiers.
//
$lines = array();

foreach ($invoices as $identifier => $invoice) {
    $lines[] = '- `' . $identifier . '` -- ' . $invoice['customer'];
}

$prompt = "Identifiers in this conversation look like `K7-M3-XR-9D-Q2`: ten\n"
        . "characters drawn from 0-9 and BCDFGHJKMNPQRSTVWXZ, in five groups of\n"
        . "two joined by hyphens. Copy them character for character. Never\n"
        . "abbreviate one, never reformat one, and never invent one that was not\n"
        . "given to you.\n\n"
        . "Invoices:\n" . implode("\n", $lines) . "\n\n"
        . "Which invoice belongs to Globex? Answer with its identifier.\n";

//
// What came back. One symbol has been substituted, which is one damage event.
//
$identifiers = array_keys($invoices);
$damaged     = $identifiers[1];
$damaged[3]  = ('B' === $damaged[3]) ? 'C' : 'B';
$reply       = 'The Globex invoice is `' . $damaged . '`.';

//
// The read path. resolve() is not an extractor -- normalization would eat the
// prose around the identifier and fail on length -- so candidates come out
// with the pattern first, one at a time.
//
preg_match_all(PATTERN, $reply, $matches);

foreach ($matches[0] as $candidate) {
    //
    // The context must be the one the identifier was minted under. Here every
    // identifier in this prompt shares it; where they do not, look it up from
    // the slot the candidate arrived in.
    //
    $resolved = $llmuid->resolve($candidate, 'invoice');

    if (FALSE === $resolved) {
        //
        // The defined failure path. Retry the call, re-fetch from the source of
        // truth, or drop the item -- but never guess, and never reach for the
        // nearest registry entry.
        //
        fwrite(STDERR, 'Unusable identifier: ' . $llmuid->last_error() . "\n");

        continue;
    }

    //
    // A repair is silent by design, so last_error() says nothing after one.
    // Comparing what came back against what went in is what surfaces it, and
    // the count is worth watching: repairs mean the channel is degrading.
    //
    if ($resolved !== $candidate) {
        fwrite(STDERR, 'Repaired ' . $candidate . ' to ' . $resolved . "\n");
    }

    //
    // Re-emit the canonical rendering resolve() returned, never the string that
    // arrived, so the next hop starts with a fresh damage budget.
    //
    echo $resolved . ' belongs to ' . $invoices[$resolved]['customer'] . "\n";
}
```

## Python

```python
import json
import re
import sys
from pathlib import Path

from llmuid import LLMUID

PATTERN = re.compile(r"\b[0-9BCDFGHJKMNPQRSTVWXZ]{2}(?:-[0-9BCDFGHJKMNPQRSTVWXZ]{2}){4}\b")

# The registry is append-only and lives in the object, so it is restored from
# storage on the way in and persisted on the way out. Everything ever issued
# goes back in, not just what is still active: minting scans it to enforce
# separation, and a retired identifier still has to resolve.

store  = Path("registry.json")
stored = json.loads(store.read_text()) if store.exists() else []
llmuid = LLMUID(stored)

# Mint one identifier per invoice, bound to the context "invoice". The context
# is stored beside the identifier because it is not part of it and cannot be
# recovered from it later.

invoices = {}

for customer in ("Acme", "Globex"):
    identifier = llmuid.mint("invoice")

    if identifier is None:
        # A failed mint means the random source is degenerate, not that the
        # space is exhausted. There is nothing to retry against.
        sys.exit(f"Could not mint: {llmuid.last_error()}")

    invoices[identifier] = {"customer": customer, "context": "invoice"}

store.write_text(json.dumps(llmuid.registry()))

# The write path. Canonical rendering, wrapped in backticks so the model reads
# them as opaque literals, and a standing instruction in every prompt that
# carries identifiers.

lines = "\n".join(
    f"- `{identifier}` -- {invoice['customer']}"
    for identifier, invoice in invoices.items()
)

prompt = f"""Identifiers in this conversation look like `K7-M3-XR-9D-Q2`: ten
characters drawn from 0-9 and BCDFGHJKMNPQRSTVWXZ, in five groups of
two joined by hyphens. Copy them character for character. Never
abbreviate one, never reformat one, and never invent one that was not
given to you.

Invoices:
{lines}

Which invoice belongs to Globex? Answer with its identifier.
"""

# What came back. One symbol has been substituted, which is one damage event.

original = list(invoices)[1]
damaged  = original[:3] + ("C" if original[3] == "B" else "B") + original[4:]
reply    = f"The Globex invoice is `{damaged}`."

# The read path. resolve() is not an extractor -- normalization would eat the
# prose around the identifier and fail on length -- so candidates come out with
# the pattern first, one at a time.

for candidate in PATTERN.findall(reply):
    # The context must be the one the identifier was minted under. Here every
    # identifier in this prompt shares it; where they do not, look it up from
    # the slot the candidate arrived in.
    resolved = llmuid.resolve(candidate, "invoice")

    if resolved is None:
        # The defined failure path. Retry the call, re-fetch from the source of
        # truth, or drop the item -- but never guess, and never reach for the
        # nearest registry entry.
        print(f"Unusable identifier: {llmuid.last_error()}", file=sys.stderr)

        continue

    # A repair is silent by design, so last_error() says nothing after one.
    # Comparing what came back against what went in is what surfaces it, and the
    # count is worth watching: repairs mean the channel is degrading.
    if resolved != candidate:
        print(f"Repaired {candidate} to {resolved}", file=sys.stderr)

    # Re-emit the canonical rendering resolve() returned, never the string that
    # arrived, so the next hop starts with a fresh damage budget.
    print(f"{resolved} belongs to {invoices[resolved]['customer']}")
```

## JavaScript

```js
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { LLMUID } from "llmuid";

const PATTERN = /\b[0-9BCDFGHJKMNPQRSTVWXZ]{2}(?:-[0-9BCDFGHJKMNPQRSTVWXZ]{2}){4}\b/g;

// The registry is append-only and lives in the object, so it is restored from
// storage on the way in and persisted on the way out. Everything ever issued
// goes back in, not just what is still active: minting scans it to enforce
// separation, and a retired identifier still has to resolve.

const stored = existsSync("registry.json") ? JSON.parse(readFileSync("registry.json", "utf8")) : [];
const llmuid = new LLMUID(stored);

// Mint one identifier per invoice, bound to the context "invoice". The context
// is stored beside the identifier because it is not part of it and cannot be
// recovered from it later.

const invoices = new Map();

for (const customer of ["Acme", "Globex"]) {
    const identifier = llmuid.mint("invoice");

    if (identifier === null) {
        // A failed mint means the random source is degenerate, not that the
        // space is exhausted. There is nothing to retry against.
        console.error(`Could not mint: ${llmuid.last_error()}`);

        process.exit(1);
    }

    invoices.set(identifier, { customer: customer, context: "invoice" });
}

writeFileSync("registry.json", JSON.stringify(llmuid.registry()));

// The write path. Canonical rendering, wrapped in backticks so the model reads
// them as opaque literals, and a standing instruction in every prompt that
// carries identifiers.

const lines = [...invoices]
    .map(([identifier, invoice]) => `- \`${identifier}\` -- ${invoice.customer}`)
    .join("\n");

const prompt = `Identifiers in this conversation look like \`K7-M3-XR-9D-Q2\`: ten
characters drawn from 0-9 and BCDFGHJKMNPQRSTVWXZ, in five groups of
two joined by hyphens. Copy them character for character. Never
abbreviate one, never reformat one, and never invent one that was not
given to you.

Invoices:
${lines}

Which invoice belongs to Globex? Answer with its identifier.
`;

// What came back. One symbol has been substituted, which is one damage event.

const original = [...invoices.keys()][1];
const damaged  = original.slice(0, 3) + (original[3] === "B" ? "C" : "B") + original.slice(4);
const reply    = `The Globex invoice is \`${damaged}\`.`;

// The read path. resolve() is not an extractor -- normalization would eat the
// prose around the identifier and fail on length -- so candidates come out with
// the pattern first, one at a time.

for (const candidate of reply.match(PATTERN) ?? []) {
    // The context must be the one the identifier was minted under. Here every
    // identifier in this prompt shares it; where they do not, look it up from
    // the slot the candidate arrived in.
    const resolved = llmuid.resolve(candidate, "invoice");

    if (resolved === null) {
        // The defined failure path. Retry the call, re-fetch from the source of
        // truth, or drop the item -- but never guess, and never reach for the
        // nearest registry entry.
        console.error(`Unusable identifier: ${llmuid.last_error()}`);

        continue;
    }

    // A repair is silent by design, so last_error() says nothing after one.
    // Comparing what came back against what went in is what surfaces it, and the
    // count is worth watching: repairs mean the channel is degrading.
    if (resolved !== candidate) {
        console.error(`Repaired ${candidate} to ${resolved}`);
    }

    // Re-emit the canonical rendering resolve() returned, never the string that
    // arrived, so the next hop starts with a fresh damage budget.
    console.log(`${resolved} belongs to ${invoices.get(resolved).customer}`);
}
```

## What the run prints

The reply names one invoice, so one candidate comes out of it. All three print
the same two lines -- the repair on standard error, the result on standard out:

```
Repaired 4T-TX-BR-JK-2T to 4T-TX-1R-JK-2T
4T-TX-1R-JK-2T belongs to Globex
```

The identifiers differ on every run, because they are drawn from the system
random source. The shape does not.

Run it twice without deleting `registry.json` and the second run mints two more
identifiers into a registry that already holds the first two, then resolves
against all four. That is what append-only looks like in practice: nothing is
removed, and the earlier identifiers keep resolving.
