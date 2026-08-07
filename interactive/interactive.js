//
// LLMUID -- the interactive companion to the specification.
//
// The engine is llmuid.js beside this file: llmuid-javascript v1.0.0, the npm
// package llmuid, copied in byte for byte. It is not maintained here; it is
// replaced here, whole, at a version bump, and one diff against its source tree
// says whether the copy is faithful. Nothing in this file is allowed to edit
// it -- the conformance vectors would catch a change in behaviour, but nothing
// catches a change in wording, and a fourth dialect of this scheme is exactly
// what nobody wants.
//
// This file is the article, and it drives that class through its public API and
// nothing else. #private is real privacy, so inlining, importing or sitting
// beside the implementation grants no access to #normalize, #distance or
// #check -- the same wall the container's tools hit, with the same answer: go
// through mint(), resolve(), registry() and last_error(), and never borrow the
// code path being demonstrated.
//
// Two consequences run through everything below. Anything shown as an
// intermediate -- the normalized symbol string, the canonical rendering --
// comes from a display helper here, labelled as such, and is never presented as
// the class's own output. And every verdict, without exception, is what
// resolve() returned.
//


//
// fail
//
// One banner covers three startup conditions, because to a reader they are the
// same fact: the live parts of this page cannot be trusted. An engine that
// cannot pass its own vectors makes every verdict here worthless, and a page
// that kept rendering confident REPAIRED banners under a broken engine would be
// committing exactly the silent misrouting the scheme exists to prevent.
//
// The prose, the diagrams and the CSS animations are untouched by this. The
// article stays readable; only the parts that would be lying stop.
//

function fail(reason)
{
    document.getElementById("bannerReason").textContent = reason;

    document.getElementById("banner").hidden = false;
}


//
// The startup flag
//
// index.html carries a classic script that raises the same banner when this
// module never loads at all. A module that failed to load cannot report its own
// failure, so something outside it has to, and this is how that script knows
// the module got here.
//

globalThis.llmuid_started = true;




//
// Display helpers
//
// Presentation only. These render and read for the narration; they decide
// nothing. The verdict on any string on this page comes from resolve().
//

const ALPHABET = "0123456789BCDFGHJKMNPQRSTVWXZ";

const SYMBOLS = new Map([...ALPHABET].flatMap((symbol) => [[symbol, symbol],
                                                           [symbol.toLowerCase(), symbol]]));


//
// read
//
// What layer 1 makes of a candidate: case folded through the table above, and
// every character outside the alphabet dropped. A table admits exactly what it
// lists, which is why nothing here calls toUpperCase() either -- U+017F would
// become an S that is in the alphabet, and this page would show an eleventh
// symbol the class never read.
//

function read(candidate)
{
    let result = "";

    for (let i = 0; i < candidate.length; i++) {
        const symbol = SYMBOLS.get(candidate[i]);

        if (symbol !== undefined) {
            result += symbol;
        }
    }

    return result;
}


//
// render
//
// The canonical rendering, counted off in symbol positions rather than split on
// a delimiter, exactly as the implementation does it. Delimiters carry no
// information anywhere in this scheme, this page included.
//

function render(symbols)
{
    const groups = [];

    for (let i = 0; i < symbols.length; i += 2) {
        groups.push(symbols.slice(i, i + 2));
    }

    return groups.join("-");
}


//
// pristine
//
// Whether resolve() handed back the candidate itself rather than something it
// repaired the candidate into. Comparing the two canonical renderings answers
// that without any of the state a demo would otherwise have to remember about
// the damage it applied.
//

function pristine(candidate, resolved)
{
    return (resolved === render(read(candidate)));
}




//
// Damage
//
// Math.random() draws the damage, and that is deliberately not the rule the
// scheme's own draw follows. Nothing here mints: these choose which token to
// break and what to break it into, which is choreography. Every identifier on
// this page came out of mint(), whose draw is the class's own, rejection
// sampled from the system's cryptographic generator.
//
// The shapes are the damage model's four events, each sized to a token: a
// substitution and a transposition leave the length alone, a deletion and a
// duplication move it by one group.
//

function pick(count)
{
    return Math.floor(Math.random() * count);
}


function other(symbol)
{
    let drawn;

    do {
        drawn = ALPHABET[pick(ALPHABET.length)];
    } while (drawn === symbol);

    return drawn;
}


function substitute(symbols)
{
    const position = pick(symbols.length - 1);

    return (symbols.slice(0, position) +
            other(symbols[position]) + other(symbols[position + 1]) +
            symbols.slice(position + 2));
}


function transpose(symbols)
{
    //
    // A pair of equal symbols transposes to itself, which is no damage at all
    // and would have the page narrate a pristine arrival under a button that
    // promised otherwise.
    //

    let position = pick(symbols.length - 1);

    while (symbols[position] === symbols[position + 1]) {
        position = pick(symbols.length - 1);
    }

    return (symbols.slice(0, position) +
            symbols[position + 1] + symbols[position] +
            symbols.slice(position + 2));
}


function drop(symbols)
{
    const position = pick(symbols.length - 1);

    return (symbols.slice(0, position) + symbols.slice(position + 2));
}


function duplicate(symbols)
{
    const position = pick(symbols.length - 1);

    return (symbols.slice(0, position + 2) +
            symbols.slice(position, position + 2) +
            symbols.slice(position + 2));
}


//
// mangle
//
// Three damage events, which is two more than the contract covers. The length
// stays inside the routing window, so this reaches layer 4 and is refused
// there -- the failure worth showing, because it is the one that had to consult
// the registry to be sure.
//

function mangle(symbols)
{
    return substitute(drop(substitute(symbols)));
}


//
// delimiters
//
// Every degraded delimiter form a model is known to produce. None of them is
// damage: the identifier underneath is untouched, and layer 1 is why that costs
// nothing.
//

function delimiters(canonical)
{
    const forms = [(text) => text.replace(/-/g, "—"),
                   (text) => text.replace(/-/g, "_"),
                   (text) => text.replace(/-/g, ""),
                   (text) => text.replace(/-/g, " "),
                   (text) => text.replace(/-/g, "--"),
                   (text) => ("`" + text.toLowerCase() + "`")];

    return forms[pick(forms.length)](canonical);
}




//
// Boot
//
// The class, held in a variable rather than reached for through an import
// binding, because the import below is deliberately not a static one.
//

let LLMUID = null;


//
// The engine is loaded dynamically, and that is what keeps a browser too old to
// run it from losing the rest of the article.
//
// llmuid.js imports its vector files with JSON import attributes, which need
// Chrome 123, Safari 17.2 or Firefox 138. A static import here would put that
// syntax in this file's dependency graph, and a browser that rejects it would
// fail to load the article whole -- including the damage animations and the
// bars, which are CSS and arithmetic and need no engine at all. A dynamic
// import fails as a rejected promise instead, which is something this page can
// catch and report.
//
// So the two demos that need nothing are wired first and unconditionally, and
// the six that need the engine wait for it. The vector files are imported here
// too, for the self-check panel's count: the module registry resolves them to
// the same modules llmuid.js already holds, so nothing is parsed twice.
//

boot();


async function boot()
{
    damage_model();
    radius();

    let counts;

    try {
        const [engine, check, normalize, distance, resolve] = await Promise.all([
            import("./llmuid.js"),
            import("./vectors/check.json",     {with: {type: "json"}}),
            import("./vectors/normalize.json", {with: {type: "json"}}),
            import("./vectors/distance.json",  {with: {type: "json"}}),
            import("./vectors/resolve.json",   {with: {type: "json"}}),
        ]);

        LLMUID = engine.LLMUID;

        counts = [["check.json", check.default.cases.length],
                  ["normalize.json", normalize.default.cases.length],
                  ["distance.json", distance.default.cases.length],
                  ["resolve.json", resolve.default.groups.reduce((total, group) => (total + group.cases.length), 0)]];
    } catch (exception) {
        fail(`The engine beside this page did not load, so nothing here is running it: ${exception.message}. ` +
             "The likeliest reason is a browser older than Chrome 123, Safari 17.2 or Firefox 138, which is " +
             "what the engine's JSON module imports need.");

        return;
    }

    //
    // The self check runs before anything is wired up, because everything after
    // it depends on the answer. It costs a few milliseconds, so there is
    // nothing here worth deferring.
    //

    const probe = new LLMUID();

    const started = performance.now();
    const graded  = probe.self_test();
    const elapsed = (performance.now() - started);

    if (graded === false) {
        fail(`The engine on this page failed its own conformance vectors: ${probe.last_error()}`);

        return;
    }

    //
    // Fourteen identifiers is enough for the sparsity story and small enough
    // that every scan on this page is instant.
    //
    // A failed mint means the host has no cryptographic random source to draw
    // from, which is the third way the live parts of this page stop being
    // trustworthy, and it raises the same banner as the other two.
    //

    const demo = new LLMUID();

    for (let i = 0; i < 14; i++) {
        if (demo.mint() === null) {
            fail(`No identifier could be minted in this browser: ${demo.last_error()}`);

            return;
        }
    }

    const issued = demo.registry();

    self_check(counts, elapsed);
    channel(demo, issued);
    anatomy(issued[0]);
    pipeline(demo, issued);
    swap();
}




//
// self_check
//
// What just passed, in the reader's own browser, a moment ago. The count comes
// out of the vector files themselves rather than being written down here: a
// figure this file maintained by hand would be a claim about the grading, and a
// figure read off the answer key is a description of it.
//

function self_check(counts, milliseconds)
{
    const total = counts.reduce((sum, [, count]) => (sum + count), 0);

    document.getElementById("gradeTotal").textContent = total;
    document.getElementById("gradeTime").textContent  = milliseconds.toFixed(1);

    document.getElementById("gradeFiles").innerHTML =
        counts.map(([file, count]) => `<div class="grade-file"><b>${count}</b><span>${file}</span></div>`).join("");

    document.getElementById("gradePanel").classList.add("passed");
}




//
// channel
//
// An identifier making hops through models and back out again, forever. The
// damage is drawn here; the verdict at the end is resolve()'s, which is what
// makes the running tallies a measurement rather than a script.
//

function channel(demo, issued)
{
    const element = document.getElementById("channelId");
    const verdict = document.getElementById("channelVerdict");

    const nodes = [...document.querySelectorAll(".hop-node")];
    const wires = [...document.querySelectorAll(".wire")];

    const counters = {pristine: 0, repaired: 0, failed: 0};

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sleep = (ms) => new Promise((resume) => setTimeout(resume, (reduced ? 10 : ms)));

    function show(symbols, damaged)
    {
        let html     = "";
        let position = 0;

        for (const character of render(symbols)) {
            if (character === "-") {
                html += '<span class="sym delim">-</span>';

                continue;
            }

            const marked = ((damaged !== null) && (damaged.includes(position) === true));

            html += `<span class="sym${marked ? " dmg" : ""}">${character}</span>`;

            position++;
        }

        element.innerHTML = html;
    }

    function mark()
    {
        for (const symbol of element.querySelectorAll(".sym")) {
            if (symbol.classList.contains("delim") === false) {
                symbol.classList.remove("dmg");
                symbol.classList.add("fix");
            }
        }
    }

    async function cycle()
    {
        let candidate = read(issued[pick(issued.length)]);
        let damaged   = null;

        //
        // Roughly the shape of the distribution two sections below: mostly
        // pristine, occasionally one slip, rarely a mangling.
        //

        const fate = Math.random();
        const at   = (1 + pick(3));

        verdict.textContent = " ";
        verdict.className   = "verdict";

        show(candidate, null);

        for (let i = 0; i < nodes.length; i++) {
            for (const node of nodes) {
                node.classList.remove("active", "hit");
            }

            nodes[i].classList.add("active");

            if (i > 0) {
                wires[i - 1].classList.add("pulse");

                await sleep(560);

                wires[i - 1].classList.remove("pulse");
            }

            if ((i === at) && (fate >= 0.55)) {
                nodes[i].classList.remove("active");
                nodes[i].classList.add("hit");

                if (fate < 0.88) {
                    const position = pick(candidate.length - 1);

                    candidate = (candidate.slice(0, position) +
                                 other(candidate[position]) + other(candidate[position + 1]) +
                                 candidate.slice(position + 2));

                    damaged = [position, position + 1];
                } else {
                    candidate = mangle(candidate);
                    damaged   = [...candidate].map((symbol, index) => index);
                }

                show(candidate, damaged);

                verdict.textContent = "⚡ damage event";
                verdict.className   = "verdict warn";

                await sleep(650);
            } else {
                await sleep(380);
            }
        }

        for (const node of nodes) {
            node.classList.remove("active", "hit");
        }

        nodes[nodes.length - 1].classList.add("active");

        await sleep(400);

        //
        // The one judgement on this page that matters, and the class makes it.
        //

        const arrived  = render(candidate);
        const resolved = demo.resolve(arrived);

        if (resolved === null) {
            verdict.textContent = `✗ ${demo.last_error()}`;
            verdict.className   = "verdict bad";

            counters.failed++;
        } else if (pristine(arrived, resolved) === true) {
            verdict.textContent = "✓ pristine — checksum clean, registry confirmed";
            verdict.className   = "verdict ok";

            counters.pristine++;
        } else {
            mark();

            await sleep(300);

            show(read(resolved), null);
            mark();

            verdict.textContent = `✓ repaired → ${resolved} — one damage event, one match`;
            verdict.className   = "verdict ok";

            counters.repaired++;
        }

        document.getElementById("tallyPristine").textContent = counters.pristine;
        document.getElementById("tallyRepaired").textContent = counters.repaired;
        document.getElementById("tallyFailed").textContent   = counters.failed;

        await sleep(1800);

        cycle();
    }

    cycle();
}




//
// anatomy
//
// The symbols are buttons rather than decorated spans, because the reveal used
// to be a hover and a touchscreen has none to give. A tap does what the legend
// does, and the legend still does it for a reader who would rather read than
// poke.
//

function anatomy(identifier)
{
    const symbols = read(identifier);

    const panel = document.getElementById("anatomy");
    const note  = document.getElementById("legendNote");

    const notes = {
        payload: "Random and patternless — nothing for a model to extrapolate, and the issued set stays vanishingly sparse in 29⁸ ≈ 500 billion possibilities. That sparsity is what makes repair reliable rather than lucky.",
        check:   "A distance-3 code over mod-29 arithmetic: two sums, one plain and one weighted by position, must both come out to the values the context requires. Every one- and two-symbol error is caught unconditionally; a fabrication satisfies both at roughly 1 in 841.",
        delim:   "Pure presentation. Punctuation is the most corrected part of any string — swapped, stripped, doubled — so no parsing decision may ever depend on it. Write strictly, read liberally.",
        idle:    "Tap a symbol, or pick a part above.",
    };

    let html = "";

    for (let i = 0; i < symbols.length; i += 2) {
        if (i > 0) {
            html += '<span class="adelim">-</span>';
        }

        html += '<span class="chunk">';

        for (let k = 0; k < 2; k++) {
            const part = (((i + k) < 8) ? "payload" : "check");

            html += `<button type="button" class="asym ${part}" data-part="${part}">${symbols[i + k]}</button>`;
        }

        html += "</span>";
    }

    document.getElementById("anatomyId").innerHTML = html;

    let active = null;

    function highlight(part)
    {
        active = ((active === part) ? null : part);

        panel.className  = ((active === null) ? "anatomy" : ("anatomy hl-" + active));
        note.textContent = ((active === null) ? notes.idle : notes[active]);

        for (const button of document.querySelectorAll(".legend button")) {
            button.className = ((button.dataset.part === active) ? ("on-" + active) : "");
        }
    }

    for (const button of document.querySelectorAll(".legend button, .asym")) {
        button.addEventListener("click", () => highlight(button.dataset.part));
    }

    //
    // The alphabet, with what it leaves out struck through. The exclusions are
    // the whole of why an identifier can never spell a word and never carries a
    // pair of lookalikes.
    //

    const gone = new Set([..."AEIOULY"]);

    let strip = "";

    for (const character of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
        strip += `<span class="alphachar${gone.has(character) ? " gone" : ""}">${character}</span>`;
    }

    strip += '<div class="alpha-cap">29 kept, and 29 is prime — the checksum arithmetic depends on it · struck: A, E, I, O, U and Y, so that an identifier can never spell a word, and L, which is visually ambiguous with 1 and I · I, O and U are struck twice over: as vowels, and as lookalikes of 1, 0 and V</div>';

    document.getElementById("alphabet").innerHTML = strip;
}




//
// damage_model
//
// Four looping micro-animations over a fixed fragment, and a set of bars. None
// of this touches the engine -- which is why it is wired before the engine is
// even asked for. It illustrates what a damage event looks like, and the
// sections either side are where the engine answers for one.
//

function damage_model()
{
    const FRAGMENT = "K7-M3-XR";

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const demos = {
        //
        // M3 becomes W8: one token substituted for another.
        //

        sub(cells)
        {
            cells[3].textContent = "W";
            cells[4].textContent = "8";

            cells[3].classList.add("bad");
            cells[4].classList.add("bad");
        },

        //
        // M3 goes missing, and the length is what says so.
        //

        del(cells)
        {
            cells[3].classList.add("bad");
            cells[4].classList.add("bad");

            setTimeout(() => {
                cells[3].classList.add("out");
                cells[4].classList.add("out");
            }, (reduced ? 100 : 600));
        },

        //
        // M3 arrives twice, which is what a model does when it loses its place.
        //

        dup(cells)
        {
            const copy = document.createElement("span");

            copy.className   = "t bad grow";
            copy.textContent = "M3";

            cells[4].after(copy);

            requestAnimationFrame(() => copy.classList.add("grown"));
        },

        //
        // M3 becomes 3M: two symbols moved, one operation, which is the whole
        // reason the distance is hand-written rather than borrowed.
        //

        swp(cells)
        {
            cells[3].textContent = "3";
            cells[4].textContent = "M";

            cells[3].classList.add("bad");
            cells[4].classList.add("bad");
        },
    };

    for (const element of document.querySelectorAll(".dmg-demo")) {
        const play = demos[element.dataset.demo];

        const run = () => {
            element.innerHTML = [...FRAGMENT].map((character) => `<span class="t">${character}</span>`).join("");

            setTimeout(() => play(element.querySelectorAll(".t")), (reduced ? 400 : 1400));
            setTimeout(run, (reduced ? 2000 : 3600));
        };

        run();
    }

    //
    // The bars fill when they scroll into view, and once.
    //

    const bimodal = document.getElementById("bimodal");

    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting === true) {
                for (const bar of bimodal.querySelectorAll(".bar-fill")) {
                    bar.style.height = bar.dataset.height;
                }

                observer.disconnect();
            }
        }
    }, {threshold: 0.4});

    observer.observe(bimodal);
}




//
// pipeline
//
// One resolve() call decides everything, and the four stages narrate what it
// must have done to get there. The mapping is not guesswork: last_error() names
// the layer that refused, in the wording the conformance vectors pin.
//
//   Too long / Too short to be one damage event  layer 2, on length alone
//   Well-formed but never issued: ...            layer 3 passed and layer 4
//                                                found nothing -- a fabrication
//   Checksum failed and no issued identifier...  layer 3 failed, layer 4 found
//                                                nothing
//   Symbols were inserted or dropped and no...   layer 2 routed past the
//                                                checksum, layer 4 found
//                                                nothing
//   Ambiguous: N issued identifiers are...       layer 4, refusing to decode
//   Wrong context: ... under this context        layer 4, re-verifying a match
//   null, with an identifier returned            accepted
//
// Two of those cannot be reached from this page, and both for good reasons.
// Ambiguity needs two issued identifiers within 2 edits of one candidate, which
// would put them within 4 of each other -- exactly what minting refuses, so a
// registry built by mint() can never contain the pair. The wrong context has a
// section of its own further down.
//

function pipeline(demo, issued)
{
    const element = document.getElementById("candText");
    const verdict = document.getElementById("pipeVerdict");

    const stages  = [...document.querySelectorAll(".stage")];
    const notes   = [...document.querySelectorAll(".stage-msg")];
    const buttons = [...document.querySelectorAll("#pipeControls button")];

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sleep = (ms) => new Promise((resume) => setTimeout(resume, (reduced ? 20 : ms)));

    //
    // Layer 3's own answer, read through the public API.
    //
    // An empty registry has no repair to offer, so what it refuses with names
    // the layer that refused: a checksum pass reads "Well-formed but never
    // issued", a failure reads "Checksum failed". That is the checksum
    // reporting on itself, obtained without reaching into the class for
    // #verify and without a second copy of the arithmetic here to drift from
    // it.
    //

    function checksum_passed(candidate)
    {
        const empty = new LLMUID();

        empty.resolve(candidate);

        const reason = empty.last_error();

        return ((reason !== null) && (reason.startsWith("Well-formed but never issued") === true));
    }

    //
    // A fabrication the registry refuses.
    //
    // Drawing ten symbols at random is not quite enough on its own: about one
    // in 841 satisfies the check arithmetic by chance, and one in
    // astronomically more lands within the repair radius of something issued.
    // Only the registry can say which, so the draw asks it.
    //

    function fabricate()
    {
        for (;;) {
            let symbols = "";

            for (let i = 0; i < 10; i++) {
                symbols += ALPHABET[pick(ALPHABET.length)];
            }

            if (demo.resolve(render(symbols)) === null) {
                return render(symbols);
            }
        }
    }

    function reset()
    {
        for (const stage of stages) {
            stage.className = "stage";
        }

        for (const note of notes) {
            note.innerHTML = "";
        }

        verdict.className   = "pipe-verdict";
        verdict.textContent = "…";
    }

    function narrate(index, state, html)
    {
        stages[index].classList.add("live", state);

        notes[index].innerHTML = html;
    }

    function settle(state, text)
    {
        verdict.className   = ("pipe-verdict " + state);
        verdict.textContent = text;

        for (const button of buttons) {
            button.disabled = false;
        }
    }

    function damage(scenario, source)
    {
        switch (scenario) {
            case "delim":  return delimiters(render(source));
            case "sub":    return render(substitute(source));
            case "swp":    return render(transpose(source));
            case "del":    return render(drop(source));
            case "dup":    return render(duplicate(source));
            case "fab":    return fabricate();
            case "mangle": return render(mangle(source));
            case "short":  return render(drop(drop(drop(source))));
        }

        return render(source);
    }

    async function run(scenario)
    {
        for (const button of buttons) {
            button.disabled = true;
        }

        reset();

        const candidate = damage(scenario, read(issued[pick(issued.length)]));

        element.textContent = candidate;

        //
        // Everything below narrates this one call.
        //

        const resolved = demo.resolve(candidate);
        const reason   = demo.last_error();

        const symbols = read(candidate);

        await sleep(400);

        narrate(0, "pass",
                `<span class="mono">${symbols}</span> · ${symbols.length} symbols. Case folded through the ` +
                "alphabet table, every character outside the alphabet dropped. Delimiter damage costs nothing from here on.");

        await sleep(650);

        if (Math.abs(symbols.length - 10) > 2) {
            narrate(1, "fail",
                    `<span class="mono">${reason}</span> — more than a token's worth of symbols either way, so the ` +
                    "damage is past the single-event budget by construction and nothing further is worth trying.");

            stages[2].classList.add("skip");
            stages[3].classList.add("skip");

            notes[2].textContent = "Not reached.";
            notes[3].textContent = "Not reached.";

            settle("bad", "✗ HARD FAILURE — flagged, never guessed at");

            return;
        }

        if (symbols.length === 10) {
            narrate(1, "pass", "Canonical length, so the positional checksum still means something. Route to it.");
        } else {
            narrate(1, "route",
                    `${symbols.length} symbols — one token's worth off. A positional checksum is meaningless once ` +
                    "symbols have shifted, so it is skipped entirely and the registry is asked instead. The deviation is " +
                    `itself diagnostic: symbols were ${(symbols.length < 10) ? "dropped" : "inserted"}.`);
        }

        await sleep(650);

        if (symbols.length !== 10) {
            stages[2].classList.add("skip");

            notes[2].textContent = "Skipped — a positional code says nothing about shifted symbols.";
        } else if (checksum_passed(candidate) === false) {
            narrate(2, "route",
                    "The two sums disagree with what this context requires. A distance-3 code catches every one- and " +
                    "two-symbol error unconditionally, so this is what a substitution or a transposition looks like from " +
                    "here — and it falls through to repair rather than being refused outright.");
        } else if (resolved === null) {
            narrate(2, "route",
                    "Both sums check out, which about 1 fabrication in 841 manages by chance. The checksum is arithmetic, " +
                    "not authority: only the registry knows what was actually issued.");
        } else {
            narrate(2, "pass",
                    "Both sums come out to what this context requires, and the registry confirms this identifier was " +
                    "issued. The common case, and the only fast accept there is.");

            stages[3].classList.add("skip");

            notes[3].textContent = "Not needed.";

            settle("ok", `✓ ACCEPTED — pristine · ${resolved}`);

            return;
        }

        await sleep(650);

        if (resolved !== null) {
            narrate(3, "pass",
                    `Exactly one issued identifier lies within 2 edits: <span class="mono">${resolved}</span>. Minting ` +
                    "keeps every pair of issued identifiers more than 4 edits apart, so a second candidate cannot exist — " +
                    "and the match is re-verified against the context before it is accepted.");

            settle("warn", `✓ REPAIRED → ${resolved} — one damage event, silently absorbed`);

            return;
        }

        narrate(3, "fail",
                `<span class="mono">${reason}</span> — bounded-distance decoding reports failure rather than picking the ` +
                "nearest match. An identifier that cannot be recovered with certainty is not recovered at all.");

        settle("bad", "✗ HARD FAILURE — flagged, never guessed at");
    }

    for (const button of buttons) {
        button.addEventListener("click", () => run(button.dataset.case));
    }
}




//
// radius
//
// Issued identifiers as points in a space far too large to draw, each with the
// radius inside which a damaged candidate is pulled home, and one candidate
// being pulled. The radii never touch, which is the whole argument.
//
// A diagram rather than a measurement, so it needs no engine and is wired
// before one is asked for.
//

function radius()
{
    const points = [[80, 80], [220, 60], [340, 110], [130, 200], [290, 220], [380, 260], [40, 260]];

    let inner = "";

    for (let i = 0; i < 130; i++) {
        const x = (10 + (Math.random() * 400));
        const y = (10 + (Math.random() * 280));

        inner += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.1" fill="#C9D3DB"/>`;
    }

    points.forEach(([x, y], i) => {
        inner += `<circle cx="${x}" cy="${y}" r="34" fill="rgba(30,138,110,.10)" stroke="#1E8A6E" ` +
                 'stroke-width="1" stroke-dasharray="3 3">' +
                 `<animate attributeName="r" values="30;34;30" dur="4s" repeatCount="indefinite" begin="${i * 0.5}s"/>` +
                 "</circle>" +
                 `<circle cx="${x}" cy="${y}" r="4" fill="#16232E"/>`;
    });

    inner += '<g><circle r="4" fill="#D9821F">' +
             '<animate attributeName="cx" values="150;220;220" keyTimes="0;.5;1" dur="5s" repeatCount="indefinite"/>' +
             '<animate attributeName="cy" values="30;60;60" keyTimes="0;.5;1" dur="5s" repeatCount="indefinite"/>' +
             '<animate attributeName="fill" values="#D9821F;#D9821F;#1E8A6E" keyTimes="0;.55;.7" dur="5s" ' +
             'repeatCount="indefinite"/>' +
             "</circle>" +
             '<text x="112" y="22" class="radius-note">damaged candidate, pulled home</text></g>' +
             '<text x="210" y="292" text-anchor="middle" class="radius-note">· = unissued space</text>';

    document.getElementById("radiusSvg").innerHTML = inner;
}




//
// swap
//
// Two identifiers minted under two contexts on one registry, then put in each
// other's slot. Both are genuine, both were issued here, and both are
// checksum-clean under the context they were minted under -- and each fails in
// the other's slot, which is the failure no per-identifier property can reach.
//
// The wording under a swapped slot is resolve()'s own, and it comes from the
// re-verification inside repair: the identifier matches itself at distance
// zero, and would be accepted as a repair of itself if that step were not
// there. Removing it is how the entire context-binding defence gets bypassed
// through the back door.
//

function swap()
{
    const CUSTOMER = "invoice.customer";
    const PRODUCT  = "invoice.product";

    const bound = new LLMUID();

    const customer = bound.mint(CUSTOMER);
    const product  = bound.mint(PRODUCT);

    if ((customer === null) || (product === null)) {
        fail(`No identifier could be minted in this browser: ${bound.last_error()}`);

        return;
    }

    const slots = [{element:    document.getElementById("slotA"),
                    identifier: document.getElementById("slotAId"),
                    verdict:    document.getElementById("slotAV"),
                    context:    CUSTOMER},
                   {element:    document.getElementById("slotB"),
                    identifier: document.getElementById("slotBId"),
                    verdict:    document.getElementById("slotBV"),
                    context:    PRODUCT}];

    const button = document.getElementById("swapBtn");
    const note   = document.getElementById("swapNote");

    let swapped = false;

    function show()
    {
        const placed = (swapped ? [product, customer] : [customer, product]);

        slots.forEach((slot, i) => {
            const resolved = bound.resolve(placed[i], slot.context);
            const reason   = bound.last_error();

            slot.identifier.textContent = placed[i];

            slot.element.className   = ("slot " + ((resolved === null) ? "bad" : "ok"));
            slot.verdict.textContent = ((resolved === null) ? `✗ ${reason}` : "✓ resolves in this slot");
        });
    }

    show();

    button.addEventListener("click", () => {
        swapped = (swapped === false);

        button.textContent = (swapped ? "Put them back" : "Swap the two identifiers");

        note.textContent = (swapped
            ? "Both strings are genuine, both were issued by this registry, and both are internally well-formed. " +
              "Each one's check symbols were derived from its own slot's context, so in the wrong slot the arithmetic " +
              "does not come out, and the worst silent error there is becomes a loud one. Read what the failure says: " +
              "repair found the identifier at distance zero and re-verified the context anyway. Without that step it " +
              "would have repaired the swapped identifier into itself and accepted it."
            : "Each identifier's check symbols were minted against its own slot's context. Right now both resolve.");

        show();
    });
}
