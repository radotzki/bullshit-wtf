// Every component, directive and pipe of the game must keep two settings, or a screen breaks
// without any error. Run: npm test (from game/). Needs Node 20+.
//
// - standalone: false, on every @Component, @Directive and @Pipe. Since Angular 19 they are
//   standalone by default, and a standalone class can't be declared in an NgModule, so the
//   build fails or the screen can't use the module's pipes and components.
// - changeDetection: ChangeDetectionStrategy.Eager, on every @Component. Since Angular 22 a
//   component defaults to OnPush, and this game changes its fields from Firebase callbacks,
//   so an OnPush screen silently stops updating: it freezes, while the build, every other test,
//   the smoke test and a full game in the emulator all pass.
//
// This test reads the source with the TypeScript parser (no build needed) and names each file
// and the line to add.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const APP = path.join(__dirname, '..', 'src', 'app');

function tsFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return tsFiles(full);
        return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [];
    });
}

// Returns one message per missing setting in the source text of one file.
function problems(source, file) {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const found = [];
    function visit(node) {
        if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
            const kind = node.expression.expression.getText(sf);
            if (kind === 'Component' || kind === 'Directive' || kind === 'Pipe') {
                const arg = node.expression.arguments[0];
                const props = {};
                if (arg && ts.isObjectLiteralExpression(arg)) {
                    for (const p of arg.properties) {
                        if (ts.isPropertyAssignment(p)) props[p.name.getText(sf)] = p.initializer.getText(sf);
                    }
                }
                const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
                const where = `${file}:${line} @${kind}`;
                if (props.standalone !== 'false') {
                    found.push(`${where} needs "standalone: false," (the game declares it in an NgModule).`);
                }
                if (kind === 'Component' && props.changeDetection !== 'ChangeDetectionStrategy.Eager') {
                    found.push(`${where} needs "changeDetection: ChangeDetectionStrategy.Eager," ` +
                        '(import ChangeDetectionStrategy from @angular/core). Without it Angular 22 ' +
                        'makes the component OnPush and its screen silently stops updating.');
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    return found;
}

test('every game component, directive and pipe has standalone: false, and every component Eager', () => {
    const files = tsFiles(APP);
    const all = files.flatMap((f) => problems(fs.readFileSync(f, 'utf8'), path.relative(path.join(__dirname, '..'), f)));
    assert.deepStrictEqual(all, [], '\n' + all.join('\n') + '\n');
});

test('the scan finds the components (so an empty result means something)', () => {
    const count = tsFiles(APP).filter((f) => /@Component\(/.test(fs.readFileSync(f, 'utf8'))).length;
    assert.ok(count >= 20, `found only ${count} components under src/app`);
});

test('the check catches a component without Eager, and one without standalone: false', () => {
    const missingEager = `
        @Component({
            standalone: false,
            selector: 'app-x',
            template: '',
        })
        export class X {}`;
    assert.match(problems(missingEager, 'x.ts').join('\n'), /x\.ts:2 @Component needs "changeDetection: ChangeDetectionStrategy\.Eager,"/);

    const onPush = missingEager.replace('standalone: false,', 'standalone: false, changeDetection: ChangeDetectionStrategy.OnPush,');
    assert.strictEqual(problems(onPush, 'x.ts').length, 1);

    const pipe = `@Pipe({ name: 'p' }) export class P {}`;
    assert.deepStrictEqual(problems(pipe, 'p.ts'), ['p.ts:1 @Pipe needs "standalone: false," (the game declares it in an NgModule).']);

    const good = `@Component({ standalone: false, changeDetection: ChangeDetectionStrategy.Eager, template: '' }) export class G {}`;
    assert.deepStrictEqual(problems(good, 'g.ts'), []);
});
