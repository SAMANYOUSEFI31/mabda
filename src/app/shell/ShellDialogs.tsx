/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The dialogs of shell: the command palette. Each lazy dialog loads the first time it is opened. */

import { CommandPalette } from '../../components/shell/CommandPalette';
import type { ReadyScope } from '../shared';

export type ShellDialogsProps = Pick<ReadyScope, 'handlePick' | 'paletteOpen' | 'searchIdx' | 'setPaletteOpen'>;

export function ShellDialogs({ handlePick, paletteOpen, searchIdx, setPaletteOpen }: ShellDialogsProps) {
  return (
    <>
    <CommandPalette open={paletteOpen} index={searchIdx} onClose={() => setPaletteOpen(false)} onPick={handlePick} />
    </>
  );
}
