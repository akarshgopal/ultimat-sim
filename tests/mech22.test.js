const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { pumpPartLoad, flowWithinShapedSec } = require('../engine/units');

function seawaterStream(kg) {
  const saltKg = kg * 0.035;
  const waterKg = kg - saltKg;
  return {
    kind: 'material',
    phase: 'liquid',
    T_C: 25,
    P_bar: 1,
    mol: {
      H2O: waterKg * 1000 / 18.01528,
      'Na+': saltKg * 1000 / 22.989769 / 2,
      'Cl-': saltKg * 1000 / 35.45 / 2,
    },
  };
}

function pumpCase(params, { feedKg = 10250, capacityM3 = 10, setpoint = 10, powerKWh = 100, acceptKg } = {}) {
  return {
    graph: {
      nodes: [
        { id: 'sea', unit: 'material-source', params: { stream: seawaterStream(feedKg) } },
        { id: 'pump', unit: 'intake-pump', capacity: capacityM3, params },
        { id: 'power', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: powerKWh } } },
        { id: 'bus', unit: 'electrical-bus' },
        { id: 'sink', unit: 'material-sink', ...(acceptKg == null ? {} : { params: { acceptKg } }) },
      ],
      edges: [
        { from: { node: 'sea', port: 'out' }, to: { node: 'pump', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'bus', port: 'in' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'pump', port: 'electricity' } },
        { from: { node: 'pump', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: { setpoints: { pump: setpoint }, priorities: { bus: ['pump'] } },
  };
}

function airStream(kmol = 1) {
  return {
    kind: 'material',
    phase: 'gas',
    T_C: 25,
    P_bar: 1,
    mol: { N2: 0.79 * kmol * 1000, O2: 0.21 * kmol * 1000 },
  };
}

function streamNm3(stream, nm3PerKmol = 22.414) {
  const totalMol = Object.values(stream.mol).reduce((sum, amount) => sum + amount, 0);
  return totalMol * nm3PerKmol / 1000;
}

function blowerCase(params, { stream, capacityNm3, setpoint, powerKWh = 10, acceptKg } = {}) {
  return {
    graph: {
      nodes: [
        { id: 'air', unit: 'material-source', params: { stream } },
        { id: 'blower', unit: 'gas-blower', capacity: capacityNm3, params },
        { id: 'power', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: powerKWh } } },
        { id: 'bus', unit: 'electrical-bus' },
        { id: 'sink', unit: 'material-sink', ...(acceptKg == null ? {} : { params: { acceptKg } }) },
      ],
      edges: [
        { from: { node: 'air', port: 'out' }, to: { node: 'blower', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'bus', port: 'in' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'blower', port: 'electricity' } },
        { from: { node: 'blower', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: { setpoints: { blower: setpoint }, priorities: { bus: ['blower'] } },
  };
}

function loadApp() {
  const donor = fs.readFileSync(path.join(__dirname, 'mech21.test.js'), 'utf8');
  const files = [...donor.matchAll(/'((?:engine|data|cases|js)\/[^']+\.js)'/g)].map(match => match[1]);
  if (files.length < 10 || !files.includes('js/flowsheet-app.js')) {
    throw new Error('mech22 loadApp could not read the MECH21 script list');
  }
  const elements = new Map();
  const makeElement = () => {
    const el = {
      listeners: {},
      addEventListener(type, listener) { this.listeners[type] = listener; },
      className: '',
      setAttribute(name, value) { this[name] = value; },
      _innerHTML: '',
      _textContent: '',
      hidden: false,
      open: false,
      dataset: {},
      get innerHTML() { return this._innerHTML; },
      set innerHTML(value) {
        this._innerHTML = String(value ?? '');
        this._textContent = this._innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      },
      get textContent() { return this._textContent; },
      set textContent(value) {
        this._textContent = String(value ?? '');
        this._innerHTML = this._textContent;
      },
    };
    el.classList = {
      add() {},
      remove() {},
      toggle() { return false; },
    };
    return el;
  };
  const document = {
    body: makeElement(),
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const context = vm.createContext({ document, console, localStorage: null });
  context.window = context;
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return { app: context.__FLOWSHEET_APP__, elements };
}

function keyEvent(key, extras = {}) {
  return {
    key,
    target: extras.target || { tagName: 'DIV' },
    shiftKey: !!extras.shiftKey,
    ctrlKey: !!extras.ctrlKey,
    metaKey: !!extras.metaKey,
    preventDefault() {},
  };
}

test('blocked outlet refits part-load SEC at the delivered flow', () => {
  const base = { pumpKWhPerM3: 0.4, densityKgM3: 1025 };
  const open = { capacityM3: 10, setpoint: 10, feedKg: 10250, powerKWh: 100 };
  const unconstrained = solveOperation(pumpCase(base, open));
  const pumpOpen = unconstrained.nodes.pump;
  assert.ok(Math.abs(pumpOpen.activity - 10) < 1e-6);
  assert.equal(pumpOpen.consumed.electricity.kWh, 4);
  assert.equal(pumpOpen.limitedBy.includes('electricity'), false);
  const half = streamMassKg(unconstrained.nodes.sink.received) / 2;

  const unset = solveOperation(pumpCase(base, { ...open, acceptKg: half }));
  const plain = unset.nodes.pump;
  assert.ok(Math.abs(plain.activity - 5) < 1e-6);
  assert.equal(plain.consumed.electricity.kWh, plain.activity * 0.4);
  assert.ok(plain.limitedBy.includes('export'));
  assert.equal(plain.limitedBy.includes('electricity'), false);

  const explicitZero = solveOperation(pumpCase({ ...base, partLoadK: 0 }, { ...open, acceptKg: half }));
  assert.ok(Math.abs(
    explicitZero.nodes.pump.consumed.electricity.kWh - plain.consumed.electricity.kWh,
  ) < 1e-9);

  const shaped = solveOperation(pumpCase({ ...base, partLoadK: 0.4 }, { ...open, acceptKg: half }));
  const pump = shaped.nodes.pump;
  assert.ok(Math.abs(pump.activity - plain.activity) < 1e-4, pump.activity);
  assert.ok(Math.abs(pump.activity - 5) < 1e-4);
  assert.ok(pump.limitedBy.includes('export'));
  assert.equal(pump.limitedBy.includes('electricity'), false);
  const secHat = 0.4 * (1 + 0.4 * (1 - pump.activity / 10) ** 2);
  assert.ok(Math.abs(pump.consumed.electricity.kWh - pump.activity * secHat) < 1e-6);
  assert.ok(Math.abs(pump.pumpKWhPerUnit - secHat) < 1e-8);
  assert.ok(Math.abs(pump.consumed.electricity.kWh - plain.consumed.electricity.kWh) > 1e-4);
  assert.ok(pump.consumed.electricity.kWh > pumpOpen.consumed.electricity.kWh / 2);
  assert.ok(Math.abs(pump.requestedInputs.electricity.kWh - plain.requestedInputs.electricity.kWh) < 1e-9);
  assert.ok(shaped.balances.maxAbsResidual < 1e-6, shaped.balances.maxAbsResidual);
});

test('partLoadK above 3 clamps to 3 and a short bus still solves', () => {
  const atHalf = pumpPartLoad({ partLoadK: 4 }, 5, 10);
  assert.equal(atHalf.k, 3);
  assert.equal(atHalf.clamped, true);
  assert.equal(atHalf.multiplier, 1 + 3 * (1 - 0.5) ** 2);
  assert.equal(pumpPartLoad({ partLoadK: 3 }, 5, 10).clamped, undefined);
  assert.throws(() => pumpPartLoad({ partLoadK: -0.2 }, 1, 10), /partLoadK/);

  const power = 1;
  const solved = solveOperation(pumpCase(
    { pumpKWhPerM3: 0.4, densityKgM3: 1025, partLoadK: 4 },
    { capacityM3: 10, setpoint: 10, feedKg: 10250, powerKWh: power },
  ));
  const pump = solved.nodes.pump;
  assert.equal(pump.pumpPartLoadClamped, true);
  assert.equal(pump.pumpPartLoadK, 3);
  assert.ok(Number.isFinite(pump.activity) && pump.activity > 0 && pump.activity < 10);
  const q = pump.activity / 10;
  const secHat = 0.4 * (1 + 3 * (1 - q) ** 2);
  assert.ok(Math.abs(pump.pumpKWhPerUnit - secHat) < 1e-8);
  assert.ok(Math.abs(pump.pumpPartLoadMultiplier - (1 + 3 * (1 - q) ** 2)) < 1e-8);
  assert.ok(Math.abs(pump.consumed.electricity.kWh - pump.activity * secHat) < 1e-6);
  assert.ok(pump.consumed.electricity.kWh <= power + 1e-8);
  assert.ok(pump.consumed.electricity.kWh > power - 1e-4);
  assert.ok(pump.limitedBy.includes('electricity'));
  const fitted = flowWithinShapedSec(0.4, { partLoadK: 4 }, 10, 10, power);
  assert.ok(Math.abs(pump.activity - fitted) < 1e-6);

  assert.throws(
    () => solveOperation(pumpCase({ pumpKWhPerM3: 0.4, densityKgM3: 1025, partLoadK: -1 })),
    /partLoadK/,
  );
});

test('redo button restores an undone block and stays disabled when the stack is empty', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<button type="button" id="redoCanvas"[^>]*>Redo<\/button>/);
  assert.match(html, /id="redoCanvas"[^>]*title="[^"]*Ctrl\+Shift\+Z \/ Ctrl\+Y/);
  assert.match(html, /or the Redo button/);

  const { app, elements } = loadApp();
  app.activateTab('process');
  app.clearFactory();
  const button = elements.get('redoCanvas');
  assert.equal(button.disabled, true);
  assert.equal(button['aria-disabled'], 'true');
  const tank = app.addNode('material-buffer');
  assert.equal(button.disabled, true);
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true }));
  assert.equal(app.graph.nodes.length, 0);
  assert.equal(button.disabled, false);
  assert.equal(button['aria-disabled'], 'false');

  const typing = { tagName: 'INPUT' };
  app.handleProcessKeydown(keyEvent('y', { ctrlKey: true, target: typing }));
  app.handleProcessKeydown(keyEvent('Z', { metaKey: true, shiftKey: true, target: typing }));
  assert.equal(app.graph.nodes.length, 0);

  button.listeners.click();
  assert.equal(app.graph.nodes.some(node => node.id === tank.id), true);
  assert.equal(app.redoStackLength, 0);
  assert.equal(button.disabled, true);
  assert.equal(button['aria-disabled'], 'true');
});

test('part-load clamp is named on the pump and blower inspector', () => {
  const { app, elements } = loadApp();
  app.activateTab('process');
  app.clearFactory();
  const pump = app.addNode('intake-pump');
  pump.params.partLoadK = 4;
  app.solve();
  const pumpHtml = elements.get('nodeControls').innerHTML;
  assert.match(pumpHtml, /clamped to 3/);
  assert.match(pumpHtml, /monotone only for k≤3/);

  const blower = app.addNode('gas-blower');
  assert.match(elements.get('nodeControls').innerHTML, /Part-load shape/);
  blower.params.partLoadK = 4;
  app.solve();
  const blowerHtml = elements.get('nodeControls').innerHTML;
  assert.match(blowerHtml, /clamped to 3/);
  assert.match(blowerHtml, /monotone only for k≤3/);
  assert.match(blowerHtml, /MECH22 part-load matches the pump and is not a fan curve/);
});

test('gas blower part-load binds on a short bus and refits after a blocked outlet', () => {
  const stream = airStream(10);
  const nm3 = streamNm3(stream);
  const base = { blowerKWhPerNm3: 0.001 };
  const ratedKWh = nm3 * 0.001;
  const power = ratedKWh * 0.4;
  const starved = solveOperation(blowerCase(
    { ...base, partLoadK: 0.4 },
    { stream, capacityNm3: nm3, setpoint: nm3, powerKWh: power },
  ));
  const blower = starved.nodes.blower;
  assert.ok(blower.activity < power / 0.001 - 1e-3, blower.activity);
  assert.ok(blower.limitedBy.includes('electricity'));
  const q = blower.activity / nm3;
  const secHat = 0.001 * (1 + 0.4 * (1 - q) ** 2);
  assert.ok(Math.abs(blower.blowerKWhPerUnit - secHat) < 1e-8);
  assert.ok(Math.abs(blower.consumed.electricity.kWh - blower.activity * secHat) < 1e-6);
  assert.ok(blower.consumed.electricity.kWh <= power + 1e-8);
  assert.equal(blower.blowerPartLoadK, 0.4);
  const plannedSec = 0.001 * (1 + 0.4 * (1 - 1) ** 2);
  assert.ok(Math.abs(blower.requestedInputs.electricity.kWh - nm3 * plannedSec) < 1e-6);

  const open = solveOperation(blowerCase(base, { stream, capacityNm3: nm3, setpoint: nm3, powerKWh: 10 }));
  assert.equal(open.nodes.blower.blowerPartLoadK, undefined);
  assert.ok(Math.abs(open.nodes.blower.consumed.electricity.kWh - ratedKWh) < 1e-9);
  const half = streamMassKg(open.nodes.sink.received) / 2;
  const blockedPlain = solveOperation(blowerCase(base, {
    stream, capacityNm3: nm3, setpoint: nm3, powerKWh: 10, acceptKg: half,
  }));
  assert.ok(Math.abs(blockedPlain.nodes.blower.consumed.electricity.kWh - blockedPlain.nodes.blower.activity * 0.001) < 1e-9);

  const blocked = solveOperation(blowerCase(
    { ...base, partLoadK: 0.4 },
    { stream, capacityNm3: nm3, setpoint: nm3, powerKWh: 10, acceptKg: half },
  ));
  const cut = blocked.nodes.blower;
  assert.ok(Math.abs(cut.activity - blockedPlain.nodes.blower.activity) < 1e-4);
  assert.ok(cut.activity < nm3 * 0.6 && cut.activity > nm3 * 0.4);
  assert.ok(cut.limitedBy.includes('export'));
  assert.equal(cut.limitedBy.includes('electricity'), false);
  const qCut = cut.activity / nm3;
  const secCut = 0.001 * (1 + 0.4 * (1 - qCut) ** 2);
  assert.ok(Math.abs(cut.consumed.electricity.kWh - cut.activity * secCut) < 1e-6);
  assert.ok(Math.abs(cut.consumed.electricity.kWh - blockedPlain.nodes.blower.consumed.electricity.kWh) > 1e-6);
  assert.ok(cut.consumed.electricity.kWh > open.nodes.blower.consumed.electricity.kWh / 2);
  assert.ok(blocked.balances.maxAbsResidual < 1e-6, blocked.balances.maxAbsResidual);
});
