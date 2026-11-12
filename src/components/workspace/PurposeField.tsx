import { useState } from 'react';
import { SegmentedControl } from '../../ui';
import type { WorkspacePurpose } from '../../core/specs';

/**
 * «این فضا برای چیست؟» when a space is made (docs/ux/audience.md): personal, business, project or empty.
 * It picks the starting tree and the example in the name field; the choice travels as a hidden `purpose` field.
 */
export function PurposeField({ onChange }: { onChange?: (purpose: WorkspacePurpose) => void }) {
  const [purpose, setPurpose] = useState<WorkspacePurpose>('personal');
  return (
    <div className="flex flex-col gap-stack-xs">
      <span className="label text-text-default">این فضا برای چیست؟</span>
      <SegmentedControl
        label="این فضا برای چیست؟" fullWidth value={purpose}
        onChange={(id) => { const p = id as WorkspacePurpose; setPurpose(p); onChange?.(p); }}
        items={[{ id: 'personal', label: 'شخصی' }, { id: 'work', label: 'کسب‌وکار' }, { id: 'project', label: 'پروژه' }, { id: 'empty', label: 'خالی' }]}
      />
      <input type="hidden" name="purpose" value={purpose} />
    </div>
  );
}

export const NAME_EXAMPLE: Record<WorkspacePurpose, string> = {
  personal: 'مثلاً: زندگی من', work: 'مثلاً: استودیو دیزاین نوین', project: 'مثلاً: پایان‌نامه، بازسازی خانه', empty: 'یک نام کوتاه',
};
