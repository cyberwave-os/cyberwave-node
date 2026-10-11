import test from 'node:test';
import assert from 'node:assert/strict';
import { sameAnnotations } from '../src/annotation-draft.ts';
import { fromImageAnnotations, toImageAnnotations } from '../../../packages/react/src/annotation/geometry.ts';
import type { SampleAnnotation } from 'cyberwave';

test('editor round-trips of backend boxes and polygons do not create unsaved changes', () => {
  const stored: SampleAnnotation[] = [
    { label: 'surface', bbox: [0.123, 0.234, 0.789, 0.891], polygon: null },
    { label: 'region', bbox: [0.1, 0.2, 0.8, 0.9], polygon: [[0.1, 0.2], [0.8, 0.2], [0.8, 0.9]] },
  ];
  const editor = fromImageAnnotations(toImageAnnotations(stored, 1920, 1080), 1920, 1080);
  assert.equal(sameAnnotations(stored, editor), true);
  assert.equal(sameAnnotations(stored, [{ ...editor[0], label: 'renamed' }, editor[1]]), false);
  assert.equal(sameAnnotations(stored, [{ ...editor[0], bbox: [0.124, 0.234, 0.789, 0.891] }, editor[1]]), false);
  assert.equal(sameAnnotations(stored, [editor[0]]), false);
  assert.equal(sameAnnotations([], []), true);
});
