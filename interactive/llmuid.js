//
// Copyright (c) 2026 Philippe Paquet.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.
//




//
// Required modules
//
// None. The class is self-contained and imports nothing from any host -- no
// node:crypto, no node:fs, no TextEncoder -- which is what lets one file run
// unchanged on Node, Deno, Bun, a browser, an edge runtime and a bare
// JavaScript shell. The digest and the UTF-8 encoding are written out below
// for that reason and no other.
//
// The conformance vectors are the exception, and they are data rather than a
// host: the module loader resolves them relative to this file, so the one path
// self_test() reads is the path in a source checkout and in an installed
// package alike.
//

import check_vectors     from "./vectors/check.json"     with { type: "json" };
import normalize_vectors from "./vectors/normalize.json" with { type: "json" };
import distance_vectors  from "./vectors/distance.json"  with { type: "json" };
import resolve_vectors   from "./vectors/resolve.json"   with { type: "json" };




//
// LLMUID
//
// Identifiers built to survive being read, copied and re-emitted by a language
// model:
//
//   const r = new LLMUID();
//   r.mint();                        // K7-M3-XR-9D-Q2
//   r.resolve("K7-M3-XR-9D-Q2");     // K7-M3-XR-9D-Q2, pristine
//   r.resolve("`k7 m3 xb 9d q2`");   // K7-M3-XR-9D-Q2, repaired
//   r.resolve("K7-M3-ZZ-ZZ-Q2");     // null, too far from anything issued
//
// The scheme is specified in llmuid.md, which lives in its own repository at
// https://github.com/philippelyp/llmuid, and is implemented here without
// variation: 10 symbols over a 29-symbol alphabet of digits and consonants, 8
// of them a random payload and 2 of them check symbols, written as five groups
// of two. The specification is authoritative; where the two disagree, this
// file is wrong.
//
// The contract is one line: any single damage event is silently repaired, and
// anything more is a failure. A candidate within Damerau-Levenshtein distance 2
// of exactly one issued identifier is repaired unconditionally; anything
// further away, or ambiguous, is refused rather than guessed at.
//
// Writing is strict -- one canonical rendering -- and reading is liberal: case,
// delimiters and wrapping carry no information and are discarded before
// anything is judged.
//
// Minting keeps every pair of issued identifiers more than 4 edits apart, which
// is twice the repair radius, so no damage event can ever carry a candidate out
// of its own identifier's radius or into another's. Mis-repair is ruled out by
// construction rather than by probability.
//
// The check symbols can be bound to a context -- a slot, a role, a parent -- so
// that a genuine identifier pasted into the wrong place fails to resolve. The
// same context string must be given to mint() and to resolve().
//
// The registry is in-memory and append-only: it lives in the object and dies
// with it. registry() hands the issued set back so a caller can persist it, and
// the constructor takes that same array back.
//
// No exceptions: failure returns null and explains itself through last_error().
// The PHP reference implementation spells that FALSE and Python spells it None;
// every one of them means the same absence, and null is what the conformance
// vectors already use.
//
// Every method here is synchronous, and that is a constraint rather than a
// convenience. See _required() for why the digest is written out rather than
// taken from crypto.subtle, and what an async resolve() would do to
// last_error().
//
// self_test() grades this class against the conformance vectors that ship
// beside it, so that "this implements the specification" is something an
// installation can check rather than take on trust.
//
// mint(context = ""): string | null
// resolve(llmuid, context = ""): string | null
// registry(): string[]
// last_error(): string | null
// self_test(): boolean
//

export class LLMUID
{
    //
    // Scheme version 1
    //
    // These parameters form one versioned unit. Changing any of them -- the
    // alphabet, the length, the split, the grouping, the radius -- is a new
    // scheme version with freshly re-derived guarantees, never a configuration
    // option. In particular the alphabet size is prime, which is what makes the
    // check arithmetic ordinary modular arithmetic, and the group size is
    // aligned to model tokenization, which is what makes one damage event
    // damage one group.
    //

    static #ALPHABET = "0123456789BCDFGHJKMNPQRSTVWXZ";

    static #BASE = 29;

    static #LENGTH  = 10;
    static #PAYLOAD = 8;

    static #GROUP     = 2;
    static #DELIMITER = "-";

    //
    // One damage event costs at most 2 edit operations, so the radius within
    // which a candidate is repaired is 2, and the separation minting enforces
    // between issued identifiers is twice that.
    //

    static #RADIUS     = 2;
    static #SEPARATION = 4;

    //
    // How far from canonical length a candidate may be and still be worth
    // repairing: one token's worth of symbols inserted or dropped.
    //

    static #WINDOW = 2;

    //
    // Redraws mint() attempts before giving up. A draw is only ever rejected by
    // the separation check, which in a space of 29^8 fires so rarely that a
    // hundred consecutive rejections is not a full registry, it is a broken
    // random source -- and no number of further attempts fixes that.
    //

    static #MINT_ATTEMPTS = 100;

    //
    // The alphabet read both ways, built once when this module is evaluated.
    //
    // #VALUES maps a symbol to the value the check arithmetic operates on.
    // #SYMBOLS maps every spelling this class will accept -- a symbol and its
    // ASCII lowercase -- to the symbol itself, and is the whole of how reading
    // folds case. Nothing here ever calls toUpperCase(), which would turn
    // U+017F LATIN SMALL LETTER LONG S into an S that is in the alphabet, read
    // an eleventh symbol out of a pristine identifier and fail it on length.
    // The reference implementation uppercases byte by byte and leaves that
    // codepoint alone; a table admits exactly what it lists, which comes to the
    // same thing for every input.
    //

    static #VALUES  = new Map([...LLMUID.#ALPHABET].map((symbol, value) => [symbol, value]));
    static #SYMBOLS = new Map([...LLMUID.#ALPHABET].flatMap((symbol) => [[symbol, symbol],
                                                                        [symbol.toLowerCase(), symbol]]));

    //
    // The two whitespace sets the context canonicalization uses, as byte
    // values. They are deliberately not the same set twice, and the difference
    // is the specification's, not an oversight to tidy up: NUL is trimmed from
    // the ends but is not whitespace in the middle, and a form feed is the
    // reverse. Getting this wrong produces check symbols that are entirely
    // believable and match nothing the other implementations mint.
    //
    // Space, tab, line feed, carriage return, NUL, vertical tab.
    //

    static #TRIM = new Set([0x20, 0x09, 0x0a, 0x0d, 0x00, 0x0b]);

    //
    // Space, tab, line feed, carriage return, form feed, vertical tab.
    //

    static #SPACE = new Set([0x20, 0x09, 0x0a, 0x0d, 0x0c, 0x0b]);

    //
    // The SHA-256 round constants: the first 32 bits of the fractional parts of
    // the cube roots of the first 64 primes, as FIPS 180-4 defines them.
    //

    static #K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
        0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
        0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
        0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
        0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);


    //
    // Variables
    //

    #last_error = null;

    //
    // The registry, keyed by the undelimited symbols so that membership is a
    // single lookup, holding the canonical rendering. Insertion order is mint
    // order, which is what registry() hands back.
    //
    // A Map rather than an object, and that is load-bearing. An object stores
    // an integer-like key as an array index and enumerates it ahead of every
    // string key, so a single all-digit identifier below 2^32 would silently
    // reorder what registry() promises to hand back in mint order. This is the
    // counterpart of the integer key the reference implementation has to cast
    // back, and the reason resolve.json carries an all-digit group.
    //

    #registry = new Map();

    //
    // The scan accelerator, keyed the same way: a 29-bit mask of the symbols
    // present in an identifier, and how many of its 10 slots are repeats.
    // Together they bound the distance to a candidate from below without
    // touching the distance matrix.
    //

    #mask       = new Map();
    #duplicates = new Map();




    //
    // Constructor
    //
    // issued seeds the registry with identifiers minted earlier -- the array
    // registry() returned in a previous process. Entries that do not normalize
    // to a full-length identifier are dropped; their check symbols cannot be
    // re-verified here, since the context an identifier was minted under is not
    // part of it.
    //

    constructor(issued = [])
    {
        for (const identifier of issued) {
            if (typeof identifier === "string") {
                const symbols = this.#normalize(identifier);

                if (symbols.length === LLMUID.#LENGTH) {
                    this.#register(symbols);
                }
            }
        }
    }




    //
    // mint
    //
    // Draw a new identifier, register it and return it in canonical rendering.
    //
    // context binds the check symbols to the slot, role or parent the
    // identifier belongs to. The same string must be handed to resolve(), which
    // is what makes a valid identifier in the wrong place detectable. The empty
    // context is a context like any other, and the default.
    //
    // null is returned when the draw could not be separated from the issued set
    // within the attempt limit, which at any sane registry size means the
    // random source is degenerate rather than the space exhausted, and when the
    // system has no random source to draw from at all.
    //

    mint(context = "")
    {
        this.#last_error = null;

        for (let attempt = 0; attempt < LLMUID.#MINT_ATTEMPTS; attempt++) {
            let payload = "";

            //
            // The draw comes from the system's cryptographic generator rather
            // than from Math.random(): it rejection-samples, so all 29 symbols
            // are equally likely where a modulo would lean on the low ones, and
            // it carries no recoverable state for a reader to extrapolate the
            // next identifier from. Uniformity is what the sparsity argument
            // rests on; unpredictability is a bonus this scheme does not claim.
            //
            // It is also the one call in the class that can throw -- when the
            // host has no random source to offer -- and a thrown exception is
            // not something this class does, so it becomes a failed mint like
            // any other.
            //
            try {
                for (let i = 0; i < LLMUID.#PAYLOAD; i++) {
                    payload += LLMUID.#ALPHABET[LLMUID.#draw()];
                }
            } catch (exception) {
                this.#last_error = `The system random source is unavailable: ${exception.message}`;

                return null;
            }

            const symbols = (payload + this.#check(payload, context));

            //
            // Separation is what turns sparsity from an expectation into an
            // invariant: nothing issued may sit within twice the repair radius
            // of anything else issued.
            //
            if (this.#registry.has(symbols) === false) {
                if (this.#near(symbols, LLMUID.#SEPARATION).length === 0) {
                    return this.#register(symbols);
                }
            }
        }

        this.#last_error = `No identifier could be drawn at the required separation in ${LLMUID.#MINT_ATTEMPTS} attempts`;

        return null;
    }




    //
    // resolve
    //
    // Validate a candidate that has been through a model, and return the
    // identifier it stands for in canonical rendering: the candidate itself
    // when it arrived pristine, the issued identifier it is one damage event
    // away from when it did not.
    //
    // context must be the context the identifier was minted under.
    //
    // null is returned when the candidate is not an identifier this registry
    // issued, when the damage exceeds one event, when two issued identifiers
    // are equally close, or when the identifier is genuine but was resolved
    // under the wrong context. last_error() says which.
    //

    resolve(llmuid, context = "")
    {
        this.#last_error = null;

        //
        // Layer 1. Normalization. Case, delimiters, wrapping and any prose that
        // came along are not part of the identifier, so they are gone before
        // anything is judged. Nothing below may depend on them.
        //
        const symbols = this.#normalize(llmuid);
        const length  = symbols.length;

        //
        // Layer 2. Length routing. The length says which damage occurred, and
        // routes on it: at canonical length the checksum is meaningful, within
        // a token's worth of it the symbols have shifted and only the registry
        // can help, and beyond that the damage is past the single-event budget
        // by construction.
        //
        if (length > (LLMUID.#LENGTH + LLMUID.#WINDOW)) {
            this.#last_error = `Too long to be one damage event: ${length} symbols, expected ${LLMUID.#LENGTH}`;

            return null;
        }

        if (length < (LLMUID.#LENGTH - LLMUID.#WINDOW)) {
            this.#last_error = `Too short to be one damage event: ${length} symbols, expected ${LLMUID.#LENGTH}`;

            return null;
        }

        //
        // Layer 3. Checksum, at canonical length only. A pass confirmed by the
        // registry is the common, pristine case and the only fast accept.
        //
        // Everything else falls through to repair rather than being refused
        // here: a checksum failure means a substitution or a shift, and a
        // checksum pass with no registry entry means a fabrication or a
        // mangling that satisfied the arithmetic by chance -- roughly 1 in 841
        // of them do -- which the registry, the final authority on what exists,
        // is what settles.
        //
        if (length === LLMUID.#LENGTH) {
            if (this.#verify(symbols, context) === true) {
                if (this.#registry.has(symbols) === true) {
                    return this.#registry.get(symbols);
                }

                //
                // Reported as the symbols that were read rather than dressed up
                // in the canonical rendering: nothing issued this, so it is not
                // an identifier and should not be shown as one.
                //
                return this.#repair(symbols, context, `Well-formed but never issued: ${symbols}`);
            }

            return this.#repair(symbols, context,
                                `Checksum failed and no issued identifier is within ${LLMUID.#RADIUS} edits`);
        }

        return this.#repair(symbols, context,
                            `Symbols were inserted or dropped and no issued identifier is within ${LLMUID.#RADIUS} edits`);
    }




    //
    // registry
    //
    // Every identifier issued, in mint order, in canonical rendering. This is
    // the array the constructor takes back, and the only way the issued set
    // outlives the object.
    //
    // Mint order is insertion order, which a Map keeps for every key -- see the
    // note where the registry is declared for what an object would have done
    // to an all-digit identifier instead.
    //

    registry()
    {
        return [...this.#registry.values()];
    }




    //
    // last_error
    //
    // Why the last call returned null, or null when it did not.
    //
    // The wording separates the two things worth watching: a repair means the
    // channel is degrading, while a failure means the pipeline is faulty, since
    // honest noise almost never produces multi-event damage.
    //
    // A method rather than a getter, so that this reads the same in every
    // implementation of the scheme.
    //

    last_error()
    {
        return this.#last_error;
    }




    //
    // self_test
    //
    // Grade this implementation against the conformance vectors in vectors/ and
    // report whether it passes every one of them. false names the first case
    // that failed through last_error().
    //
    // The vectors are the answer key. They belong to the specification rather
    // than to this language, and they are frozen: a failure here means this
    // implementation has drifted from the specification, never that a vector
    // wants updating.
    //
    // The class grades itself rather than the package carrying a test framework
    // to do it, which is what lets a scheme whose whole claim is that two
    // implementations agree exactly ship with no dependencies at all.
    //
    // The vectors cannot reach mint(): it is random by design and no fixed case
    // can pin it, which is why the last section draws identifiers and checks
    // the invariants minting is responsible for instead.
    //
    // Nothing here touches this object beyond the error slot. The helpers it
    // calls on this hold no state, and every registry it needs is built on a
    // throwaway instance -- the registry is append-only, so a self-test that
    // minted into its caller would leave no way back.
    //
    // What it cannot reach either is the digest underneath _required(). Every
    // context these vectors carry is short, so the SHA-256 message padding is
    // exercised at four lengths and never at the boundary where it goes wrong.
    // That belongs to the published FIPS 180-4 vectors, and is graded outside
    // this package.
    //

    self_test()
    {
        this.#last_error = null;

        if (this.#test_check() === false) {
            return false;
        }

        if (this.#test_normalize() === false) {
            return false;
        }

        if (this.#test_distance() === false) {
            return false;
        }

        if (this.#test_resolve() === false) {
            return false;
        }

        if (this.#test_scan() === false) {
            return false;
        }

        return this.#test_mint();
    }




    //
    // #repair
    //
    // Layer 4, the authoritative one: find the issued identifiers within the
    // repair radius and accept only when there is exactly one.
    //
    // reason is what to report when nothing is close enough, phrased by the
    // caller so the failure names the damage that routed the candidate here.
    //
    // The re-verification below is easy to leave out and expensive to leave
    // out: a genuine identifier resolved under the wrong context fails the
    // checksum, arrives here, matches itself at distance zero and would be
    // accepted as a repair of itself -- silently undoing the whole point of
    // binding the checksum to a context.
    //

    #repair(symbols, context, reason)
    {
        const matches = this.#near(symbols, LLMUID.#RADIUS);
        const count   = matches.length;

        if (count === 0) {
            this.#last_error = reason;

            return null;
        }

        if (count > 1) {
            //
            // Not reachable in practice: minting keeps every issued pair more
            // than twice this radius apart, so no candidate should sit inside
            // two radii at once. That separation is measured with #distance(),
            // which is the restricted variant and not a true metric, so this is
            // a bound rather than a theorem -- and if it ever failed to hold
            // the outcome is the refusal below, never a mis-repair.
            //
            // Refused rather than decoded either way: bounded-distance decoding
            // reports ambiguity, it does not pick a winner.
            //
            this.#last_error = `Ambiguous: ${count} issued identifiers are within ${LLMUID.#RADIUS} edits`;

            return null;
        }

        const match = matches[0];

        if (this.#verify(match, context) === false) {
            this.#last_error = `Wrong context: ${this.#registry.get(match)} was not issued under this context`;

            return null;
        }

        return this.#registry.get(match);
    }




    //
    // #near
    //
    // Every issued identifier within radius edits of symbols, as an array of
    // registry keys.
    //
    // This is the one scan in the class, shared by minting at the separation
    // radius and by repair at the repair radius, so the accelerator below has a
    // single home.
    //
    // A full distance matrix per registry entry is affordable at a few hundred
    // identifiers and not at ten thousand, so each entry is screened first
    // against an exact lower bound:
    //
    //   distance >= max(length_a, length_b) - overlap
    //
    // where overlap is the size of the largest common sub-multiset of symbols.
    // Every edit changes the symbol multiset by at most one element -- an
    // adjacent transposition changes it not at all -- so an alignment can match
    // at most overlap symbols, and everything unmatched costs an operation.
    //
    // The overlap itself is bounded from above without counting anything: the
    // symbols the two have in common, from the population count of the AND of
    // their masks, plus the repeated slots the smaller of the two can
    // contribute. That is a mask AND, a bit count and a comparison per entry,
    // and it discards about 95 percent of a random registry before any matrix
    // is built. It can only ever discard an entry that is genuinely out of
    // range: removing it would cost speed and change no answer.
    //
    // A Map key is a string and stays one, so the cast the reference
    // implementation puts around an all-digit registry key has no counterpart
    // here. The all-digit group in resolve.json therefore pins nothing in this
    // implementation, and costs nothing to honour.
    //

    #near(symbols, radius)
    {
        const result = [];

        if (this.#registry.size === 0) {
            return result;
        }

        const [mask, duplicates] = this.#signature(symbols);

        const length = symbols.length;

        //
        // Every registry entry is canonical length, #register() being the only
        // writer and both its callers handing it that. So the pair is the same
        // length in every case but a shifted candidate, where the longer of the
        // two is what has to be accounted for -- which makes the span the same
        // for every entry, and this the place to work it out.
        //
        const span = Math.max(LLMUID.#LENGTH, length);

        for (const [candidate, candidate_mask] of this.#mask) {
            const slack = Math.min(duplicates, this.#duplicates.get(candidate));

            const overlap = (LLMUID.#popcount(mask & candidate_mask) + slack);

            if ((span - overlap) <= radius) {
                if (this.#distance(symbols, candidate, radius) <= radius) {
                    result.push(candidate);
                }
            }
        }

        return result;
    }




    //
    // #distance
    //
    // Damerau-Levenshtein distance, pricing a substitution, an insertion, a
    // deletion and a transposition of adjacent symbols at one operation each --
    // the four damage events, one operation apiece.
    //
    // Written out rather than taken from a stock Levenshtein routine, none of
    // which prices adjacent transpositions and would put a transposed pair at
    // distance 2 where the damage model puts it at 1.
    //
    // Bounded: a row whose best entry is already past limit can only get worse,
    // so the walk stops there and reports limit + 1. Callers only ever ask
    // whether a candidate is inside a radius, so the exact distance beyond it
    // is worth nothing.
    //
    // Indexing is by code unit, which is safe because both arguments come from
    // #normalize() and every symbol in the alphabet is ASCII.
    //

    #distance(a, b, limit)
    {
        const length_a = a.length;
        const length_b = b.length;

        if (Math.abs(length_a - length_b) > limit) {
            return (limit + 1);
        }

        let previous_previous = [];
        let previous          = [...Array(length_b + 1).keys()];

        for (let i = 1; i <= length_a; i++) {
            const current = new Array(length_b + 1).fill(0);

            current[0] = i;

            let best = i;

            const symbol_a = a[i - 1];

            for (let j = 1; j <= length_b; j++) {
                const cost = (symbol_a === b[j - 1]) ? 0 : 1;

                let value = (previous[j] + 1);

                if ((current[j - 1] + 1) < value) {
                    value = (current[j - 1] + 1);
                }

                if ((previous[j - 1] + cost) < value) {
                    value = (previous[j - 1] + cost);
                }

                if ((i > 1) && (j > 1) && (symbol_a === b[j - 2]) && (a[i - 2] === b[j - 1])) {
                    if ((previous_previous[j - 2] + 1) < value) {
                        value = (previous_previous[j - 2] + 1);
                    }
                }

                current[j] = value;

                if (value < best) {
                    best = value;
                }
            }

            if (best > limit) {
                return (limit + 1);
            }

            previous_previous = previous;
            previous          = current;
        }

        return previous[length_b];
    }




    //
    // #register
    //
    // Admit an identifier to the registry and return its canonical rendering.
    //
    // The only write path, and the only place an identifier is rendered: the
    // read path never builds a string, it returns the one stored here. Writing
    // is strict, so the lines below are the single definition of what an
    // identifier looks like -- fixed groups joined by the delimiter, counted
    // off in symbols rather than split on a delimiter that carries nothing and
    // may not have survived.
    //

    #register(symbols)
    {
        const groups = [];

        for (let i = 0; i < symbols.length; i += LLMUID.#GROUP) {
            groups.push(symbols.slice(i, (i + LLMUID.#GROUP)));
        }

        const canonical = groups.join(LLMUID.#DELIMITER);

        const [mask, duplicates] = this.#signature(symbols);

        this.#registry.set(symbols, canonical);
        this.#mask.set(symbols, mask);
        this.#duplicates.set(symbols, duplicates);

        return canonical;
    }




    //
    // #normalize
    //
    // Uppercase the candidate and drop every character outside the alphabet.
    //
    // This is deliberately liberal: delimiter damage is the most frequent
    // damage of all, so hyphens turned into dashes, underscores, spaces or
    // nothing must cost nothing, and so must a backtick wrapper or stray
    // whitespace. A lookalike a model substituted (O for 0, I or L for 1) is
    // not in the alphabet either and is dropped rather than guessed at, which
    // leaves a short candidate that registry repair recovers as the insertion
    // it was.
    //
    // Both halves of that are one table lookup, for the reason given where
    // #SYMBOLS is built: a character this class has not listed is not a symbol,
    // whatever some case mapping would turn it into.
    //
    // The layers below filter whatever this admits.
    //

    #normalize(candidate)
    {
        let result = "";

        for (let i = 0; i < candidate.length; i++) {
            const symbol = LLMUID.#SYMBOLS.get(candidate[i]);

            if (symbol !== undefined) {
                result += symbol;
            }
        }

        return result;
    }




    //
    // #check
    //
    // The two check symbols for a payload under a context.
    //
    // The code is a minimum-distance-3 Reed-Solomon-style code over the
    // alphabet. Because the alphabet size is prime the field arithmetic is
    // ordinary arithmetic modulo 29: the check symbols are chosen so that two
    // weighted sums over all 10 symbols -- one unweighted, one weighted by the
    // positions 1 to 10 -- both come out to the values the context requires.
    //
    // With x at position 9 and y at position 10 that is
    //
    //   x + y      = A   (mod 29)
    //   9x + 10y   = B   (mod 29)
    //
    // whose matrix has determinant 1, so y = B - 9A and x = A - y, and there is
    // exactly one answer to solve for rather than a space to search.
    //
    // Distance 3 detects every one- and two-symbol error unconditionally, which
    // is precisely what one damage event can do to a candidate that is still
    // canonical length: substitute a token of up to two adjacent symbols, or
    // transpose an adjacent pair. Nothing the contract covers can pass through
    // the fast accept as pristine.
    //
    // JavaScript's remainder follows the sign of the dividend, as PHP's does,
    // so every subtraction below is corrected back into range before it is
    // used. A language whose modulo is already non-negative does not need those
    // corrections; leaving them out here produces a negative index into the
    // alphabet and an undefined symbol.
    //

    #check(payload, context)
    {
        const required = this.#required(context);

        let total    = 0;
        let weighted = 0;

        for (let i = 0; i < payload.length; i++) {
            const value = LLMUID.#VALUES.get(payload[i]);

            total    += value;
            weighted += ((i + 1) * value);
        }

        const a = ((((required[0] - total) % LLMUID.#BASE) + LLMUID.#BASE) % LLMUID.#BASE);
        const b = ((((required[1] - weighted) % LLMUID.#BASE) + LLMUID.#BASE) % LLMUID.#BASE);

        const y = ((((b - (9 * a)) % LLMUID.#BASE) + LLMUID.#BASE) % LLMUID.#BASE);
        const x = ((((a - y) % LLMUID.#BASE) + LLMUID.#BASE) % LLMUID.#BASE);

        return (LLMUID.#ALPHABET[x] + LLMUID.#ALPHABET[y]);
    }




    //
    // #verify
    //
    // Whether a full-length candidate carries the check symbols its payload
    // requires under this context.
    //
    // Recomputing them and comparing is the same test as evaluating both sums,
    // and it is the one place both the fast accept and the re-verification
    // inside repair go through.
    //

    #verify(symbols, context)
    {
        if (symbols.length !== LLMUID.#LENGTH) {
            return false;
        }

        const payload = symbols.slice(0, LLMUID.#PAYLOAD);

        return (symbols.slice(LLMUID.#PAYLOAD) === this.#check(payload, context));
    }




    //
    // #required
    //
    // The two values the check sums must come out to, derived from the context.
    //
    // Binding is native to the code: the arithmetic and its guarantees do not
    // change, only the targets do, and an identifier resolved under a context
    // it was not minted under fails. The empty context is a context like any
    // other and takes the fixed pair.
    //
    // The derivation has to be deterministic over a canonical encoding of the
    // context and identical at mint and at resolve, so two components that
    // spell the same context differently do not end up with two contexts.
    // Trimmed, internal whitespace collapsed, lowercased.
    //
    // All of that happens over the encoded bytes, and every step of it is
    // narrower than the text operation it resembles. toLowerCase() folds case
    // by codepoint where this scheme folds it by byte; trim() eats every space
    // Unicode knows about and spares a NUL where this one does very nearly the
    // reverse; and \s in a regular expression matches U+00A0 and U+FEFF among
    // many others. Each of those would produce check symbols that are entirely
    // believable and match nothing another implementation minted. No
    // conformance vector reaches them -- the contexts they carry are ASCII --
    // so the divergence would surface as identifiers that will not cross a
    // language boundary.
    //
    // The digest is written out in this file rather than taken from
    // crypto.subtle, and that is not a preference. crypto.subtle.digest is
    // asynchronous, and there is no way to wait on a promise from a
    // synchronous method: the resolution is a microtask, so it cannot run until
    // the stack that would be waiting has already unwound. Making this method
    // async would carry through mint(), resolve() and self_test(), and would
    // break last_error(): two concurrent resolve() calls would race on one
    // error slot, and the caller that succeeded would read the caller that
    // failed. A synchronous digest is what keeps failure a return value.
    //

    #required(context)
    {
        const bytes = LLMUID.#encode(context);

        let start = 0;
        let end   = bytes.length;

        while ((start < end) && (LLMUID.#TRIM.has(bytes[start]) === true)) {
            start++;
        }

        while ((end > start) && (LLMUID.#TRIM.has(bytes[end - 1]) === true)) {
            end--;
        }

        if (start === end) {
            return [0, 0];
        }

        //
        // Lowercasing is ASCII A-Z and nothing else, byte by byte, which is
        // what the reference implementation's strtolower() does to a byte
        // string.
        //
        // The collapse runs in the same pass. Its whitespace set is not the
        // trim set: a form feed is collapsed but not trimmed, so one at the
        // front of a context survives to become a single leading space, and a
        // NUL is trimmed but is not whitespace in the middle.
        //
        const canonical = [];

        let space = false;

        for (let i = start; i < end; i++) {
            const byte = bytes[i];

            if (LLMUID.#SPACE.has(byte) === true) {
                if (space === false) {
                    canonical.push(0x20);

                    space = true;
                }

                continue;
            }

            canonical.push(((byte >= 0x41) && (byte <= 0x5a)) ? (byte + 0x20) : byte);

            space = false;
        }

        const digest = LLMUID.#sha256(Uint8Array.from(canonical));

        //
        // The first eight bytes as two big-endian 32-bit words. The unsigned
        // shift is what makes them unsigned: a leading byte above 0x7F leaves
        // the OR negative, and a negative remainder would be a negative index
        // into the alphabet. Reading these little-endian instead produces check
        // symbols that look perfectly correct and match nothing.
        //
        return [(LLMUID.#word(digest, 0) % LLMUID.#BASE),
                (LLMUID.#word(digest, 4) % LLMUID.#BASE)];
    }




    //
    // #signature
    //
    // The screening pair for an identifier: a mask with one bit set per
    // alphabet symbol it contains, and how many of its slots are repeats of a
    // symbol already counted.
    //

    #signature(symbols)
    {
        let mask = 0;

        for (let i = 0; i < symbols.length; i++) {
            mask |= (1 << LLMUID.#VALUES.get(symbols[i]));
        }

        return [mask, (symbols.length - LLMUID.#popcount(mask))];
    }




    //
    // #encode
    //
    // A string as its UTF-8 bytes.
    //
    // Written out rather than taken from TextEncoder for two reasons. The first
    // is that it keeps this class free of every host global, so one file runs
    // in a browser, on a server and in a bare shell without a branch. The
    // second is that TextEncoder replaces a lone surrogate -- the one thing a
    // JavaScript string can hold that UTF-8 has no encoding for -- with
    // U+FFFD, where the reference implementation is handed raw bytes and Python
    // asks for surrogatepass. Encoding it as its own three bytes is what keeps
    // all three implementations agreeing on a context no vector can carry.
    //

    static #encode(text)
    {
        const bytes = [];

        for (let i = 0; i < text.length; i++) {
            let code = text.charCodeAt(i);

            //
            // A well-formed surrogate pair is one code point. A high surrogate
            // that is not followed by a low one falls through and is encoded as
            // itself.
            //
            if ((code >= 0xd800) && (code <= 0xdbff) && ((i + 1) < text.length)) {
                const low = text.charCodeAt(i + 1);

                if ((low >= 0xdc00) && (low <= 0xdfff)) {
                    code = (0x10000 + ((code - 0xd800) * 0x400) + (low - 0xdc00));

                    i++;
                }
            }

            if (code < 0x80) {
                bytes.push(code);
            } else if (code < 0x800) {
                bytes.push((0xc0 | (code >> 6)),
                           (0x80 | (code & 0x3f)));
            } else if (code < 0x10000) {
                bytes.push((0xe0 | (code >> 12)),
                           (0x80 | ((code >> 6) & 0x3f)),
                           (0x80 | (code & 0x3f)));
            } else {
                bytes.push((0xf0 | (code >> 18)),
                           (0x80 | ((code >> 12) & 0x3f)),
                           (0x80 | ((code >> 6) & 0x3f)),
                           (0x80 | (code & 0x3f)));
            }
        }

        return Uint8Array.from(bytes);
    }




    //
    // #sha256
    //
    // FIPS 180-4 SHA-256, over bytes, synchronously.
    //
    // Present for the reason #required() gives: crypto.subtle.digest is
    // asynchronous and this scheme's API is not. Every arithmetic step is
    // 32-bit, which is what JavaScript's bitwise operators already are, and the
    // intermediate sums stay well inside the 53 bits a number holds exactly
    // before the unsigned shift brings them back into range.
    //
    // This class only ever reads the first eight bytes of the result, so the
    // conformance vectors exercise the message padding at four lengths and
    // never at the boundary where an implementation gets it wrong. The
    // published FIPS 180-4 vectors are what cover that, and they are graded
    // outside this package.
    //

    static #sha256(bytes)
    {
        const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                   0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);

        //
        // The message, a single 0x80 byte, then zeros, then the length in bits
        // as a 64-bit big-endian integer, padded out to a multiple of 64 bytes.
        // A message of 56 bytes is the case worth knowing: the length no longer
        // fits in the block it ends in, so it takes one more.
        //
        const length = bytes.length;
        const total  = ((Math.floor((length + 8) / 64) + 1) * 64);

        const block = new Uint8Array(total);

        block.set(bytes);

        block[length] = 0x80;

        const bits = (length * 8);

        const high = Math.floor(bits / 4294967296);
        const low  = (bits % 4294967296);

        for (let i = 0; i < 4; i++) {
            block[total - 8 + i] = ((high >>> ((3 - i) * 8)) & 0xff);
            block[total - 4 + i] = ((low >>> ((3 - i) * 8)) & 0xff);
        }

        const w = new Uint32Array(64);

        for (let offset = 0; offset < total; offset += 64) {
            for (let i = 0; i < 16; i++) {
                const at = (offset + (i * 4));

                w[i] = (((block[at] << 24) | (block[at + 1] << 16) |
                         (block[at + 2] << 8) | block[at + 3]) >>> 0);
            }

            for (let i = 16; i < 64; i++) {
                const s0 = ((LLMUID.#rotate(w[i - 15], 7) ^ LLMUID.#rotate(w[i - 15], 18) ^
                             (w[i - 15] >>> 3)) >>> 0);
                const s1 = ((LLMUID.#rotate(w[i - 2], 17) ^ LLMUID.#rotate(w[i - 2], 19) ^
                             (w[i - 2] >>> 10)) >>> 0);

                //
                // The store into a Uint32Array is what wraps the sum back to 32
                // bits, so no correction is written here.
                //
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1);
            }

            let a = h[0];
            let b = h[1];
            let c = h[2];
            let d = h[3];
            let e = h[4];
            let f = h[5];
            let g = h[6];
            let x = h[7];

            for (let i = 0; i < 64; i++) {
                const s1 = ((LLMUID.#rotate(e, 6) ^ LLMUID.#rotate(e, 11) ^
                             LLMUID.#rotate(e, 25)) >>> 0);
                const ch = (((e & f) ^ (~e & g)) >>> 0);

                const temp1 = ((x + s1 + ch + LLMUID.#K[i] + w[i]) >>> 0);

                const s0  = ((LLMUID.#rotate(a, 2) ^ LLMUID.#rotate(a, 13) ^
                              LLMUID.#rotate(a, 22)) >>> 0);
                const maj = (((a & b) ^ (a & c) ^ (b & c)) >>> 0);

                const temp2 = ((s0 + maj) >>> 0);

                x = g;
                g = f;
                f = e;
                e = ((d + temp1) >>> 0);
                d = c;
                c = b;
                b = a;
                a = ((temp1 + temp2) >>> 0);
            }

            h[0] += a;
            h[1] += b;
            h[2] += c;
            h[3] += d;
            h[4] += e;
            h[5] += f;
            h[6] += g;
            h[7] += x;
        }

        const digest = new Uint8Array(32);

        for (let i = 0; i < 8; i++) {
            digest[i * 4]       = ((h[i] >>> 24) & 0xff);
            digest[(i * 4) + 1] = ((h[i] >>> 16) & 0xff);
            digest[(i * 4) + 2] = ((h[i] >>> 8) & 0xff);
            digest[(i * 4) + 3] = (h[i] & 0xff);
        }

        return digest;
    }




    //
    // #rotate
    //
    // A 32-bit value rotated right. The unsigned shift on the way out is what
    // keeps the result out of the negative half, where the exclusive ors above
    // would still be correct but nothing else would read as intended.
    //

    static #rotate(value, bits)
    {
        return (((value >>> bits) | (value << (32 - bits))) >>> 0);
    }




    //
    // #word
    //
    // Four bytes of a digest as one unsigned big-endian 32-bit number.
    //

    static #word(bytes, offset)
    {
        return (((bytes[offset] << 24) | (bytes[offset + 1] << 16) |
                 (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0);
    }




    //
    // #draw
    //
    // One uniformly distributed symbol value from the host's cryptographic
    // generator.
    //
    // 232 is 8 times 29, so discarding every byte at or above it and reducing
    // the rest leaves all 29 values exactly equally likely. A bare remainder
    // over 256 would hand the first 24 symbols an extra chance each, and
    // uniformity is what the sparsity argument rests on.
    //
    // Throws when the host offers no generator at all, which is the one thing
    // this class cannot substitute for and the one place mint() has to catch.
    //

    static #draw()
    {
        const source = globalThis.crypto;

        if ((source === undefined) || (source === null) ||
            (typeof source.getRandomValues !== "function")) {
            throw new Error("no crypto.getRandomValues on this host");
        }

        const byte = new Uint8Array(1);

        for (;;) {
            source.getRandomValues(byte);

            if (byte[0] < 232) {
                return (byte[0] % LLMUID.#BASE);
            }
        }
    }




    //
    // #popcount
    //
    // How many bits are set in a mask.
    //
    // Clearing the lowest set bit each turn runs once per set bit rather than
    // once per bit, and needs neither a lookup table nor a primitive some host
    // might not have. The bound the count feeds is what matters here, not the
    // way it is produced.
    //

    static #popcount(mask)
    {
        let count = 0;

        while (mask !== 0) {
            mask &= (mask - 1);

            count++;
        }

        return count;
    }




    //
    // #load_vectors
    //
    // Check one vector document's header and hand back the array of cases it
    // carries.
    //
    // The header is checked before the cases are. A file that declares another
    // scheme version, or that has been copied over the wrong name, would
    // otherwise be graded case by case and fail somewhere deep on a mismatch
    // that says nothing about what actually went wrong.
    //
    // The document arrives already parsed, because the module loader resolved
    // it relative to this file rather than a path being built here. That is
    // what makes the one path work in a source checkout and in an installed
    // package alike, and it is why there is no unreadable-file branch: a vector
    // file that will not parse fails the import rather than this method, which
    // is a broken installation and not a runtime input. The check that catches
    // the failure worth catching -- a file copied over the wrong name -- is
    // still here.
    //

    #load_vectors(document, filename, key)
    {
        if ((document === null) || (typeof document !== "object")) {
            this.#last_error = `Vector file is not valid JSON: vectors/${filename}`;

            return null;
        }

        if (Number.isInteger(document.scheme) === false) {
            this.#last_error = `Vector file declares no scheme version: vectors/${filename}`;

            return null;
        }

        if (document.scheme !== 1) {
            this.#last_error = `Vector file is for another scheme version: vectors/${filename} declares ${document.scheme}`;

            return null;
        }

        if (document.file !== filename) {
            this.#last_error = `Vector file is not the one it claims to be: vectors/${filename}`;

            return null;
        }

        if (Array.isArray(document[key]) === false) {
            this.#last_error = `Vector file carries no ${key}: vectors/${filename}`;

            return null;
        }

        return document[key];
    }




    //
    // #test_check
    //
    // check.json: payload and context in, the two check symbols out.
    //
    // This is where a second implementation most often lands somewhere
    // plausible and wrong. The context digest is eight bytes read big-endian,
    // and reading them little-endian produces check symbols that look perfectly
    // correct and match nothing. These cases carry no label of their own, so
    // the payload identifies them.
    //

    #test_check()
    {
        const cases = this.#load_vectors(check_vectors, "check.json", "cases");

        if (cases === null) {
            return false;
        }

        for (let index = 0; index < cases.length; index++) {
            const item = cases[index];

            const check = this.#check(item.payload, item.context);

            if (item.check !== check) {
                return this.#test_failed("check.json", `case ${index}, payload ${item.payload}`,
                                         LLMUID.#test_show(item.check), LLMUID.#test_show(check));
            }
        }

        return true;
    }




    //
    // #test_normalize
    //
    // normalize.json: raw input in, the undelimited symbols out.
    //
    // The last case is the one worth staring at. Case folding here is a table
    // of the spellings this class accepts, so U+017F LATIN SMALL LETTER LONG S
    // is not among them and is dropped, where toUpperCase() would turn it into
    // an S that is in the alphabet and read an eleventh symbol.
    //

    #test_normalize()
    {
        const cases = this.#load_vectors(normalize_vectors, "normalize.json", "cases");

        if (cases === null) {
            return false;
        }

        for (const item of cases) {
            const output = this.#normalize(item.input);

            if (item.output !== output) {
                return this.#test_failed("normalize.json", item.label,
                                         LLMUID.#test_show(item.output), LLMUID.#test_show(output));
            }
        }

        return true;
    }




    //
    // #test_distance
    //
    // distance.json: bounded Damerau-Levenshtein distance.
    //
    // Two things are pinned at once, and only one of them is arithmetic. An
    // adjacent transposition costs one operation, which is what a stock
    // Levenshtein routine would price at two; and past the limit the walk
    // reports limit + 1 rather than the true distance, so an implementation
    // whose arithmetic is right and whose bound is not still disagrees here.
    //

    #test_distance()
    {
        const cases = this.#load_vectors(distance_vectors, "distance.json", "cases");

        if (cases === null) {
            return false;
        }

        for (const item of cases) {
            const distance = this.#distance(item.a, item.b, item.limit);

            if (item.distance !== distance) {
                return this.#test_failed("distance.json", item.label,
                                         String(item.distance), String(distance));
            }
        }

        return true;
    }




    //
    // #test_resolve
    //
    // resolve.json: the damage contract end to end, in four groups, each
    // carrying the registry its expectations assume.
    //
    // The wording of the failure is asserted and not merely the fact of it. The
    // specification treats a repair and a hard failure as two distinct
    // telemetry signals, and the wording is where that distinction lives. A
    // success carrying no error at all is the same assertion from the other
    // side: it is what makes a repair silent.
    //
    // The fourth group is there for the reference implementation's sake, where
    // an all-digit identifier becomes an integer registry key that has to be
    // cast back. A Map key is a string whatever it spells, so the group costs
    // nothing to honour and pins nothing here.
    //

    #test_resolve()
    {
        const groups = this.#load_vectors(resolve_vectors, "resolve.json", "groups");

        if (groups === null) {
            return false;
        }

        for (const group of groups) {
            for (const item of group.cases) {
                //
                // A fresh object per case, exactly as the expectations were
                // recorded, so that nothing one case leaves behind can decide
                // the next one's answer.
                //
                const llmuid = new LLMUID(group.registry);

                const result = llmuid.resolve(item.candidate, item.context);
                const error  = llmuid.last_error();

                //
                // The vectors spell absence as JSON null, the one form every
                // language agrees on. This class spells it null, so the two
                // need no translation between them.
                //
                const label = `${group.name}, ${item.label}`;

                if (item.expect !== result) {
                    return this.#test_failed("resolve.json", label,
                                             LLMUID.#test_show(item.expect),
                                             LLMUID.#test_show(result));
                }

                if (item.error !== error) {
                    return this.#test_failed("resolve.json", `${label}, error`,
                                             LLMUID.#test_show(item.error),
                                             LLMUID.#test_show(error));
                }
            }
        }

        return true;
    }




    //
    // #test_scan
    //
    // The registry scan at the separation radius, in the direction minting
    // depends on and nothing else exercises.
    //
    // #near() is asked for two radii and only one of them is covered. Repair
    // asks at 2, which resolve.json pins from both sides. Minting asks at 4,
    // and there the answer is always empty -- that is what an accepted draw
    // means -- so a #near() that had stopped finding anything at 4 would look
    // identical from outside, mint() would accept every draw it was handed, and
    // separation would quietly stop being enforced with no symptom anywhere.
    //
    // So the screen is checked against the distance it exists to accelerate.
    // The mask screen discards an entry before any matrix is built, on the
    // claim that it can only ever discard one genuinely out of range; that
    // claim is what this pins. For candidates spread either side of the radius,
    // #near() and #distance() must agree entry by entry.
    //
    // What this cannot reach is whether mint() still asks. Forcing the check to
    // fire would mean crowding a space of 29^8 until a hundred consecutive
    // draws were all rejected, and reaching in to steer the draw would mean a
    // seam in the random source that the scheme does not allow.
    //

    #test_scan()
    {
        //
        // Seeded through the constructor, which admits identifiers without
        // enforcing anything, so the entries are fixed and known rather than
        // drawn.
        //
        const registry = ["K7-M3-XR-9D-CN", "T5-VQ-2B-NH-2R", "9W-C4-KZ-FM-5G", "43-96-92-98-62"];

        const llmuid = new LLMUID(registry);

        const entries = registry.map((identifier) => this.#normalize(identifier));

        //
        // Candidates spread from zero edits to past the radius, built from two
        // entries: an ordinary one, and the all-digit one that the reference
        // implementation has to cast back out of an integer key.
        //
        const candidates = [];

        for (const base of [entries[0], entries[3]]) {
            candidates.push(base);

            let damaged = base;

            //
            // Substitutions at spreading positions walk the boundary, from one
            // edit out to one past the radius.
            //
            for (let i = 0; i < 5; i++) {
                const position = (i * 2);

                const replacement = (damaged[position] === "B") ? "C" : "B";

                damaged = (damaged.slice(0, position) + replacement + damaged.slice(position + 1));

                candidates.push(damaged);
            }

            //
            // The shifts either side of it, because a length change is what
            // makes the screen's span the longer of the two rather than the
            // canonical length.
            //
            candidates.push(base.slice(0, 4) + "B" + base.slice(4));
            candidates.push(base.slice(0, 4) + "BC" + base.slice(4));
            candidates.push(base.slice(0, 4) + base.slice(5));
            candidates.push(base.slice(0, 4) + base.slice(6));
            candidates.push(LLMUID.#test_transpose(base, 4));
        }

        candidates.push(entries[1]);

        for (const candidate of candidates) {
            const near = llmuid.#near(candidate, LLMUID.#SEPARATION);

            for (const entry of entries) {
                const found  = near.includes(entry);
                const within = (this.#distance(candidate, entry, LLMUID.#SEPARATION) <= LLMUID.#SEPARATION);

                if (found !== within) {
                    return this.#test_failed("the separation scan", `${candidate} against ${entry}`,
                                             (within ? "found" : "not found"),
                                             (found ? "found" : "not found"));
                }
            }
        }

        return true;
    }




    //
    // #test_mint
    //
    // The invariants no vector can pin.
    //
    // mint() is random by design, so there is no fixed case to record and the
    // vectors leave it alone entirely. What can still be checked is what
    // minting is answerable for: that a drawn identifier renders canonically,
    // survives each of the four damage events, refuses a context it was not
    // minted under, and lands further than twice the repair radius from
    // everything issued before it.
    //
    // Deliberately deterministic even so. Drawing fresh damage on every run
    // would find cases nobody thought to write down, and would also report
    // failures that do not reproduce -- and a check a release depends on has to
    // give the same answer twice.
    //

    #test_mint()
    {
        const batch = 20;

        const llmuid = new LLMUID();

        const issued = [];

        for (let i = 0; i < batch; i++) {
            const identifier = llmuid.mint();

            if (identifier === null) {
                this.#last_error = `Self-test failed in mint, drawing a batch: ${llmuid.last_error()}`;

                return false;
            }

            issued.push(identifier);
        }

        for (const identifier of issued) {
            const symbols = this.#normalize(identifier);

            //
            // Writing is strict: one rendering, counted off in symbols. Rebuild
            // it from what liberal reading gave back and the two must be the
            // same string.
            //
            const groups = [];

            for (let i = 0; i < symbols.length; i += LLMUID.#GROUP) {
                groups.push(symbols.slice(i, (i + LLMUID.#GROUP)));
            }

            const canonical = groups.join(LLMUID.#DELIMITER);

            if (canonical !== identifier) {
                return this.#test_failed("mint", "canonical rendering",
                                         LLMUID.#test_show(canonical), LLMUID.#test_show(identifier));
            }

            //
            // The four damage events, one edit apiece, at a position inside the
            // payload. Every one must come back as the identifier it damaged,
            // and come back silently -- the whole contract, drawn fresh rather
            // than read out of a file. The replacement symbol is chosen against
            // the one it displaces, since a payload is random and a fixed one
            // would sometimes substitute a symbol for itself.
            //
            const replacement = (symbols[4] === "B") ? "C" : "B";

            const candidates = new Map([
                ["pristine",      identifier],
                ["substitution",  symbols.slice(0, 4) + replacement + symbols.slice(5)],
                ["transposition", LLMUID.#test_transpose(symbols, 4)],
                ["insertion",     symbols.slice(0, 4) + replacement + symbols.slice(4)],
                ["deletion",      symbols.slice(0, 4) + symbols.slice(5)],
            ]);

            for (const [damage, candidate] of candidates) {
                if (this.#test_round_trip(llmuid, candidate, "", identifier, damage) === false) {
                    return false;
                }
            }
        }

        //
        // Separation, measured independently of the code that enforces it.
        // Nothing issued may sit within twice the repair radius of anything
        // else issued, which is what makes it impossible for one damage event
        // to carry a candidate into a neighbour's radius.
        //
        // This asserts the property, and at twenty draws out of 29^8 that is
        // all it can do: draws are this far apart on their own, so a mint()
        // that had quietly stopped enforcing separation would still pass here.
        // The machinery it would have stopped using is covered instead, by
        // #test_scan() above; what neither reaches is whether mint() still
        // asks.
        //
        for (let i = 0; i < issued.length; i++) {
            for (let j = 0; j < issued.length; j++) {
                if (i < j) {
                    const distance = this.#distance(this.#normalize(issued[i]),
                                                    this.#normalize(issued[j]),
                                                    LLMUID.#SEPARATION);

                    if (distance <= LLMUID.#SEPARATION) {
                        return this.#test_failed("mint",
                                                 `separation between ${issued[i]} and ${issued[j]}`,
                                                 `more than ${LLMUID.#SEPARATION}`, String(distance));
                    }
                }
            }
        }

        //
        // The registry outlives the object: what registry() hands out is what
        // the constructor takes back, in mint order and canonical rendering,
        // with nothing added and nothing lost.
        //
        const persisted = llmuid.registry();

        const matched = ((issued.length === persisted.length) &&
                         issued.every((identifier, i) => identifier === persisted[i]));

        if (matched === false) {
            return this.#test_failed("mint", "registry", `${batch} identifiers in mint order`,
                                     `${persisted.length} that do not match`);
        }

        const restored = new LLMUID(persisted);

        for (const identifier of issued) {
            if (this.#test_round_trip(restored, identifier, "", identifier,
                                      "registry round trip") === false) {
                return false;
            }
        }

        return this.#test_context();
    }




    //
    // #test_context
    //
    // Binding the check symbols to a context, on a freshly drawn identifier.
    //
    // The wrong context is searched for rather than assumed. Two contexts land
    // on the same check symbols about once in 841, which on a drawn payload
    // would fail this perhaps one run in eight hundred, so the first candidate
    // whose check symbols actually differ is the one used. "invoice line" is in
    // the list because it is a different context from "invoice" and not a
    // longer spelling of it.
    //

    #test_context()
    {
        const context = "invoice";

        const llmuid = new LLMUID();

        const identifier = llmuid.mint(context);

        if (identifier === null) {
            this.#last_error = `Self-test failed in mint, binding a context: ${llmuid.last_error()}`;

            return false;
        }

        if (this.#test_round_trip(llmuid, identifier, context, identifier, "right context") === false) {
            return false;
        }

        const payload = this.#normalize(identifier).slice(0, LLMUID.#PAYLOAD);
        const check   = this.#check(payload, context);

        let wrong = "";

        for (const other of ["receipt", "order", "shipment", "invoice line"]) {
            if (check !== this.#check(payload, other)) {
                wrong = other;

                break;
            }
        }

        if (wrong === "") {
            this.#last_error = `Self-test failed in mint, wrong context: every candidate context collides with ${context}`;

            return false;
        }

        const result = llmuid.resolve(identifier, wrong);

        if (result !== null) {
            return this.#test_failed("mint", "wrong context", "null", LLMUID.#test_show(result));
        }

        //
        // Named as its own failure rather than folded into the generic one. A
        // genuine identifier under the wrong context is the case that repair
        // would silently swallow if the re-verification inside it were ever
        // removed, and this wording is what would notice.
        //
        const expect_error = `Wrong context: ${identifier} was not issued under this context`;

        if (expect_error !== llmuid.last_error()) {
            return this.#test_failed("mint", "wrong context, error", LLMUID.#test_show(expect_error),
                                     LLMUID.#test_show(llmuid.last_error()));
        }

        return true;
    }




    //
    // #test_round_trip
    //
    // One resolve that has to succeed silently: the candidate comes back as the
    // identifier it stands for, and the error slot is left empty. A repair that
    // reports an error is not a repair.
    //

    #test_round_trip(llmuid, candidate, context, expect, label)
    {
        const result = llmuid.resolve(candidate, context);

        if (expect !== result) {
            return this.#test_failed("mint", label, LLMUID.#test_show(expect),
                                     LLMUID.#test_show(result));
        }

        const error = llmuid.last_error();

        if (error !== null) {
            return this.#test_failed("mint", `${label}, error`, "null", LLMUID.#test_show(error));
        }

        return true;
    }




    //
    // #test_transpose
    //
    // Swap the symbol at position with the one after it: one damage event, one
    // edit operation.
    //

    static #test_transpose(symbols, position)
    {
        return (symbols.slice(0, position) + symbols[position + 1] + symbols[position] +
                symbols.slice(position + 2));
    }




    //
    // #test_failed
    //
    // Record a mismatch and report it back up. One phrasing for all of them, so
    // that a failure always names the file, the case and both values, which is
    // the whole of what is needed to go and find it.
    //

    #test_failed(file, label, expected, actual)
    {
        this.#last_error = `Self-test failed in ${file}, ${label}: expected ${expected}, got ${actual}`;

        return false;
    }




    //
    // #test_show
    //
    // A value as it should read inside a failure message: quoted when it is a
    // string, since the empty one is otherwise invisible, and spelled out when
    // it is the null this class returns for absence.
    //

    static #test_show(value)
    {
        if (value === null) {
            return "null";
        }

        return `'${value}'`;
    }
}
