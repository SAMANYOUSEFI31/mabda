/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ContextObject,
  ContextRelationship,
  Contradiction,
  GapItem,
  ReadinessResult,
  TreeNode,
  WorkstreamSpec,
} from '../types';
import { DEFAULT_TREE_NODES } from './specs';

/**
 * Returns parent chain for a node to resolve context inheritance:
 * e.g. 'offer' -> ['offer', 'product', 'business']
 */
export function getAncestorNodeIds(nodeId: string, nodes: TreeNode[] = DEFAULT_TREE_NODES): string[] {
  const result: string[] = [nodeId];
  let current = nodes.find((n) => n.id === nodeId);
  while (current && current.parentId) {
    result.push(current.parentId);
    current = nodes.find((n) => n.id === current?.parentId);
  }
  return result;
}

/**
 * Filters active context objects (excluding archived or superseded items)
 * that belong to the specified branch or any of its ancestors.
 */
export function resolveActiveContextsForNode(
  nodeId: string,
  allObjects: ContextObject[],
  nodes: TreeNode[] = DEFAULT_TREE_NODES
): ContextObject[] {
  const validNodeIds = new Set(getAncestorNodeIds(nodeId, nodes));

  return allObjects.filter((item) => {
    if (item.status === 'Archived' || item.status === 'Superseded') {
      return false;
    }
    return validNodeIds.has(item.nodeId);
  });
}

/**
 * Analyzes gaps and calculates readiness for a specific Workstream spec
 */
export function calculateReadinessAndGaps(
  spec: WorkstreamSpec,
  objects: ContextObject[],
  _relationships: ContextRelationship[] = []
): ReadinessResult {
  const activeObjects = objects.filter(
    (o) => o.status !== 'Archived' && o.status !== 'Superseded'
  );

  const gaps: GapItem[] = [];
  let confirmedRequiredCount = 0;

  // 1. Check Required Contexts
  for (const req of spec.requiredContext) {
    // Find matching object in active objects
    const found = activeObjects.find(
      (o) =>
        (o.title.toLowerCase().includes(req.label.toLowerCase()) ||
          o.content.toLowerCase().includes(req.key.toLowerCase()) ||
          o.nodeId === req.nodeId) &&
        o.content.trim().length > 15
    );

    if (!found) {
      gaps.push({
        key: req.key,
        label: req.label,
        importance: 'required',
        nodeId: req.nodeId,
        status: 'missing',
        question: `هنوز «${req.label}» ثبت نشده است. ${req.description} را مشخص می‌کنی؟`,
        suggestedAnswers: generateSuggestedAnswers(req.key),
        dependsOn: req.dependsOn,
      });
    } else if (found.status === 'Needs Review' || found.content.trim().length < 30) {
      gaps.push({
        key: req.key,
        label: req.label,
        importance: 'required',
        nodeId: req.nodeId,
        status: 'ambiguous',
        question: `مورد «${found.title}» نیاز به شفاف‌سازی دارد: آیا این توضیح به اندازه کافی دقیق است؟`,
        suggestedAnswers: [found.content, 'تکمیل با جزئیات بیشتر', 'تأیید همین متن'],
        dependsOn: req.dependsOn,
      });
      if (found.status === 'Confirmed') {
        confirmedRequiredCount += 0.5;
      }
    } else if (found.status === 'Confirmed') {
      confirmedRequiredCount += 1;
    } else {
      // Proposed
      confirmedRequiredCount += 0.7;
    }
  }

  // 2. Check Suggested Contexts
  for (const sug of spec.suggestedContext) {
    const found = activeObjects.find(
      (o) =>
        o.nodeId === sug.nodeId ||
        o.title.toLowerCase().includes(sug.label.toLowerCase())
    );
    if (!found) {
      gaps.push({
        key: sug.key,
        label: sug.label,
        importance: 'suggested',
        nodeId: sug.nodeId,
        status: 'missing',
        question: `برای بهبود کیفیت، پیشنهاد می‌شود «${sug.label}» را هم مشخص کنی: ${sug.description}`,
        suggestedAnswers: generateSuggestedAnswers(sug.key),
      });
    }
  }

  // Sort gaps by dependencies (items with dependsOn come after prerequisites)
  gaps.sort((a, b) => {
    if (a.importance === 'required' && b.importance !== 'required') return -1;
    if (a.importance !== 'required' && b.importance === 'required') return 1;
    if (a.dependsOn?.includes(b.key)) return 1;
    if (b.dependsOn?.includes(a.key)) return -1;
    return 0;
  });

  const totalRequired = spec.requiredContext.length;
  const score = totalRequired > 0 ? Math.min(100, Math.round((confirmedRequiredCount / totalRequired) * 100)) : 100;

  let status: ReadinessResult['status'] = 'ready';
  if (score < 50) {
    status = 'blocked';
  } else if (score < 85) {
    status = 'needs_work';
  }

  const missingReqCount = gaps.filter((g) => g.importance === 'required' && g.status === 'missing').length;
  const summary =
    status === 'ready'
      ? `آمادگی کامل: تمام ${totalRequired} مؤلفه اصلی تأیید شده‌اند. خروجی با حداکثر انسجام تولید خواهد شد.`
      : status === 'needs_work'
      ? `آمادگی متوسط (${score}٪): ${totalRequired - missingReqCount} از ${totalRequired} مؤلفه الزامی آماده است. خروجی قابل تولید است اما با کیفیت کمتر.`
      : `نیاز به اطلاعات پایه: ${missingReqCount} مؤلفه حیاتی هنوز مشخص نشده است. توصیه می‌شود ابتدا به شکاف‌ها پاسخ دهید.`;

  return {
    score,
    status,
    confirmedCount: Math.floor(confirmedRequiredCount),
    totalRequired,
    gaps,
    summary,
  };
}

function generateSuggestedAnswers(key: string): string[] {
  switch (key) {
    case 'domain_field':
      return ['مشاوره استراتژی برند و محتوا', 'طراحی محصول دیجیتال و UI/UX', 'توسعه نرم‌افزار B2B و اتوماسیون'];
    case 'target_audience':
      return ['فریلنسرها و مشاوران سولو', 'استارتاپ‌های بذری و فاز اولیه', 'کسب‌وکارهای آنلاین اینستاگرامی'];
    case 'core_problem':
      return ['پراکندگی تصمیمات و بازتوضیح مکرر به ابزارهای AI', 'عدم انسجام بین خروجی‌های بازاریابی و فروش', 'تولید محتوای کلیشه‌ای بدون زاویه دید تخصصی'];
    case 'value_proposition':
      return ['تبدیل دانش پراکنده به دارایی ساختاریافته با منشأ شفاف', 'کاهش اصطکاک تصمیم با هدایت خودکار AI به جای پرامپت‌نویسی دستی'];
    case 'differentiation':
      return ['دانش سلسله‌مراتبی با منبع، Gap و Replay به جای حافظه گنگ', 'تخصص کامل در بازار و زبان فارسی با موتور کیفیت'];
    case 'pricing_boundary':
      return ['تخفیف حجمی و رایگان نداریم؛ قیمت بر اساس ارزش است نه ساعت کار', 'حداقل بودجه هر پروژه ثابت است'];
    default:
      return ['تعریف سفارشی با ورودی کاربر'];
  }
}

/**
 * Detects contradictions between decisions or conflicting constraints
 */
export function detectContradictions(objects: ContextObject[]): Contradiction[] {
  const active = objects.filter((o) => o.status === 'Confirmed' || o.status === 'Proposed');
  const contradictions: Contradiction[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];

      // Check for opposing decisions in target audience
      const isTargetA = a.title.includes('مخاطب') || a.content.includes('مخاطب');
      const isTargetB = b.title.includes('مخاطب') || b.content.includes('مخاطب');
      if (isTargetA && isTargetB) {
        if (
          (a.content.includes('فریلنسر') && b.content.includes('سازمان‌های بزرگ اینترپرایز')) ||
          (a.content.includes('B2C') && b.content.includes('B2B انحصاری'))
        ) {
          contradictions.push({
            id: `contra_${a.id}_${b.id}`,
            itemA: a,
            itemB: b,
            reason: 'تناقض در تعیین مخاطب هدف: یکی به مشتریان خرد/فریلنسر و دیگری به سازمان‌های اینترپرایز اشاره دارد.',
            suggestedResolution: 'یکی از این دو تصمیم را به عنوان مخاطب اصلی برگزینید یا یکی را در شاخه فرعی قرار دهید.',
          });
        }
      }

      // Check for discount contradiction
      const hasNoDiscount = a.content.includes('تخفیف نداریم') || a.content.includes('بدون تخفیف');
      const hasDiscountOffer = b.content.includes('تخفیف ۵۰٪') || b.content.includes('آفر رایگان') || b.content.includes('تخفیف ویژه');
      if (hasNoDiscount && hasDiscountOffer) {
        contradictions.push({
          id: `contra_${a.id}_${b.id}`,
          itemA: a,
          itemB: b,
          reason: 'تناقض با مرز قیمت‌گذاری: در قیدها ذکر شده «تخفیف نداریم»، اما در آفرها تخفیف تعریف شده است.',
          suggestedResolution: 'قید عدم تخفیف را اصلاح کنید یا آفر تخفیف‌دار را از حالت تأییدشده خارج نمایید.',
        });
      }
    }
  }

  return contradictions;
}
