/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { ContextObject, TreeNode } from '../types';
import { contextToMarkdown } from '../core/contextMarkdown';
import { Dialog, Button, EmptyState } from '../ui';
import { DocReader } from './DocReader';

interface Props {
  nodeId: string | null;
  nodes: TreeNode[];
  objects: ContextObject[];
  onClose: () => void;
}

/** «سند این گره»: the node and everything under it as a typeset document (Markdown source one click away). */
export const NodeReaderDialog: React.FC<Props> = ({ nodeId, nodes, objects, onClose }) => {
  const node = nodes.find((n) => n.id === nodeId);
  const markdown = nodeId ? contextToMarkdown({ nodes, objects, nodeId }) : '';
  return (
    <Dialog
      open={!!nodeId && !!node}
      onClose={onClose}
      size="xl"
      title={node ? `سند: ${node.label}` : 'سند'}
      description="همهٔ دانش فعال این گره و زیرشاخه‌هایش، به همان شکلی که AI می‌خواند."
      footer={<Button variant="secondary" onClick={onClose}>بستن</Button>}
    >
      <DocReader
        markdown={markdown}
        fileName={node?.label ?? 'context'}
        empty={<EmptyState icon="Inbox" title="این گره هنوز دانشی ندارد" />}
      />
    </Dialog>
  );
};
