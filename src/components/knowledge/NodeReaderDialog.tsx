/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContextObject, ContextRelationship, TreeNode } from '../../types';
import { contextToMarkdown } from '../../core/contextMarkdown';
import { Dialog, Button, EmptyState } from '../../ui';
import { DocReader } from './DocReader';

interface Props {
  nodeId: string | null;
  nodes: TreeNode[];
  objects: ContextObject[];
  relationships?: ContextRelationship[];
  onClose: () => void;
}

/** «سند این بخش»: the node and everything under it as a typeset document (Markdown source one click away). */
export const NodeReaderDialog: React.FC<Props> = ({ nodeId, nodes, objects, relationships = [], onClose }) => {
  const [refs, setRefs] = useState(false);
  const node = nodes.find((n) => n.id === nodeId);
  const markdown = nodeId ? contextToMarkdown({ nodes, objects, nodeId, refs, relationships }) : '';
  return (
    <Dialog
      open={!!nodeId && !!node}
      onClose={onClose}
      size="xl"
      title={node ? `سند: ${node.label}` : 'سند'}
      description="همهٔ دانش فعال این بخش و زیرشاخه‌هایش، به همان شکلی که AI می‌خواند."
      footer={<Button variant="secondary" onClick={onClose}>بستن</Button>}
    >
      <DocReader
        markdown={markdown}
        fileName={node?.label ?? 'context'}
        refs={{ checked: refs, onChange: setRefs }}
        empty={<EmptyState icon="Inbox" title="این بخش هنوز دانشی ندارد" />}
      />
    </Dialog>
  );
};
