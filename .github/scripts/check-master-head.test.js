// node --test .github/scripts/*.test.js
// Builds small throwaway git repositories and runs the guard against them. No network.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { NOT_DEPLOYED, notDeployed } = require('./check-master-head.js');

const SCRIPT = path.join(__dirname, 'check-master-head.js');
const git = (cwd, ...args) => execFileSync('git',
    ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// A "remote" with one commit on master, and a shallow checkout of it, as actions/checkout makes.
function setup(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-guard-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const remote = path.join(dir, 'remote');
    fs.mkdirSync(remote);
    git(remote, 'init', '--quiet', '--initial-branch=master');
    const commit = (file, text) => {
        fs.mkdirSync(path.dirname(path.join(remote, file)), { recursive: true });
        fs.writeFileSync(path.join(remote, file), text);
        git(remote, 'add', '-A');
        git(remote, 'commit', '--quiet', '-m', 'change ' + file);
        return git(remote, 'rev-parse', 'HEAD');
    };
    const first = commit('functions/src/index.ts', 'one');
    const url = 'file://' + remote;
    const checkout = path.join(dir, 'checkout');
    git(dir, 'clone', '--quiet', '--depth=1', url, checkout);
    const run = sha => spawnSync('node', [SCRIPT, url, 'master', sha], { cwd: checkout, encoding: 'utf8' });
    return { remote, url, checkout, commit, first, run };
}

test('passes when the run\'s commit is the head of master', t => {
    const r = setup(t);
    const out = r.run(r.first);
    assert.strictEqual(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /is the head of master/);
});

test('stops an old run once master holds newer code, and says to start a new run', t => {
    const r = setup(t);
    r.commit('functions/src/index.ts', 'two');
    const out = r.run(r.first);
    assert.strictEqual(out.status, 1);
    assert.match(out.stdout, /^::error title=Deploy stopped, nothing released::/);
    assert.match(out.stdout, /functions\/src\/index\.ts/);
    assert.match(out.stdout, /Run workflow > branch master/);
});

test('stops when the newer commit changes the site, the rules or a workflow', t => {
    for (const file of ['game/src/app/app.component.ts', 'database-rules.json', '.github/workflows/deploy.yml']) {
        const r = setup(t);
        r.commit(file, 'x');
        assert.strictEqual(r.run(r.first).status, 1, file);
    }
});

test('passes when master moved on only in files that are never deployed', t => {
    const r = setup(t);
    r.commit('DEPLOYING.md', 'guide');
    r.commit('docs/screenshots/a.png', 'png');
    r.commit('graphics/logo.svg', 'svg');
    r.commit('game/TODO.md', 'todo');
    const out = r.run(r.first);
    assert.strictEqual(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /only in files that are never deployed/);
});

test('stops when a newer commit mixes a guide with code', t => {
    const r = setup(t);
    r.commit('DEPLOYING.md', 'guide');
    r.commit('game/src/main.ts', 'code');
    assert.strictEqual(r.run(r.first).status, 1);
});

// git follows renames by default and would print only the new name: a deployed file that master
// moved out of the deployed set would then look like a never-deployed file. The old run still
// holds the file, so it must stop.
const move = (r, from, to) => {
    fs.mkdirSync(path.dirname(path.join(r.remote, to)), { recursive: true });
    git(r.remote, 'mv', from, to);
    git(r.remote, 'commit', '--quiet', '-m', 'move ' + from + ' to ' + to);
};

test('stops when master moved a deployed file into docs/', t => {
    const r = setup(t);
    move(r, 'functions/src/index.ts', 'docs/index.ts');
    const out = r.run(r.first);
    assert.strictEqual(out.status, 1, out.stdout + out.stderr);
    assert.match(out.stdout, /differs in deployed files \(functions\/src\/index\.ts\)/);
});

test('stops when master renamed a deployed file to end in .md', t => {
    const r = setup(t);
    move(r, 'functions/src/index.ts', 'functions/src/index.md');
    const out = r.run(r.first);
    assert.strictEqual(out.status, 1, out.stdout + out.stderr);
    assert.match(out.stdout, /differs in deployed files \(functions\/src\/index\.ts\)/);
});

test('passes for the newest commit after several', t => {
    const r = setup(t);
    r.commit('functions/src/index.ts', 'two');
    const newest = r.commit('functions/src/index.ts', 'three');
    git(r.checkout, 'fetch', '--quiet', '--depth=1', r.url, newest);
    git(r.checkout, 'checkout', '--quiet', newest);
    assert.strictEqual(r.run(newest).status, 0);
});

test('stops when the repository cannot be read', t => {
    const r = setup(t);
    const out = spawnSync('node', [SCRIPT, 'file://' + path.join(r.remote, 'nowhere'), 'master', r.first],
        { cwd: r.checkout, encoding: 'utf8' });
    assert.strictEqual(out.status, 1);
    assert.match(out.stdout, /Could not read the newest commit of master/);
});

test('stops when the branch does not exist', t => {
    const r = setup(t);
    const out = spawnSync('node', [SCRIPT, r.url, 'main', r.first], { cwd: r.checkout, encoding: 'utf8' });
    assert.strictEqual(out.status, 1);
});

test('stops on missing or malformed arguments', t => {
    const r = setup(t);
    for (const args of [[], [r.url], [r.url, 'master'], [r.url, 'master', 'abc123'], [r.url, 'master', '']]) {
        const out = spawnSync('node', [SCRIPT, ...args], { cwd: r.checkout, encoding: 'utf8' });
        assert.strictEqual(out.status, 1, JSON.stringify(args));
        assert.match(out.stdout, /usage:/);
    }
});

test('the never-deployed list matches paths-ignore in deploy.yml', () => {
    const yml = fs.readFileSync(path.join(__dirname, '..', 'workflows', 'deploy.yml'), 'utf8');
    const block = yml.match(/paths-ignore:\n((?:\s+(?:#.*|- .*)\n)+)/);
    assert.ok(block, 'paths-ignore not found in deploy.yml');
    const listed = block[1].split('\n').map(l => l.trim()).filter(l => l.startsWith('- '))
        .map(l => l.slice(2).trim().replace(/^'(.*)'$/, '$1'));
    assert.deepStrictEqual(listed, NOT_DEPLOYED);
});

test('never-deployed patterns', () => {
    for (const f of ['README.md', 'DEPLOYING.md', 'game/TODO.md', 'docs/a.png', 'docs/x/y.txt', 'graphics/logo.svg']) {
        assert.strictEqual(notDeployed(f), true, f);
    }
    for (const f of ['game/src/main.ts', 'functions/docs/a.ts', 'database-rules.json', 'firebase.json',
        '.github/workflows/deploy.yml', 'docs.ts', 'graphics.json', 'a.md.ts', 'game/src/assets/graphics/x.png']) {
        assert.strictEqual(notDeployed(f), false, f);
    }
});
