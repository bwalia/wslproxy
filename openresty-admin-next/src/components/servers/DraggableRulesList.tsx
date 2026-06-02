"use client";

import React, { useCallback } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Accessible sortable list for the assigned-rules panel on the server
 * detail page.
 *
 * Order matters at the backend — rules are evaluated by `priority` and
 * then by position in the server's `rules[]` array as a tiebreaker (see
 * CLAUDE.md §4: rule_selector).  Users need to be able to reorder rules
 * here, including via keyboard (dnd-kit's built-in keyboard coordinate
 * getter handles ArrowKeys + Space to pick up / drop, which is
 * WAI-ARIA-compliant).
 *
 * Props mirror the shape `ServerRulesTab` already uses:
 *  - `ruleIds` — ordered array of assigned rule IDs
 *  - `labelFor(id)` — resolves human label (from the upstream ruleOptions)
 *  - `onChange(next)` — replace the ordered array
 *  - `onRemove(id)` — unassign a rule entirely
 */

export interface DraggableRulesListProps {
  ruleIds: string[];
  labelFor: (id: string) => string;
  onChange: (next: string[]) => void;
  onRemove: (id: string) => void;
}

interface SortableItemProps {
  id: string;
  label: string;
  onRemove: (id: string) => void;
}

function SortableItem({ id, label, onRemove }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 transition-shadow",
        "dark:border-slate-700 dark:bg-slate-800/80",
        isDragging && "shadow-lg ring-2 ring-primary-500/40",
      )}
    >
      {/* Drag handle — uses `listeners` + `attributes` so keyboard also
          picks this element up.  Screen readers announce it as "button". */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${label}`}
        className="shrink-0 cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:cursor-grabbing dark:hover:bg-slate-700 dark:hover:text-slate-300"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {label}
        </span>
        <span className="block truncate font-mono text-xs text-slate-400 dark:text-slate-500">
          {id}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onRemove(id)}
        aria-label={`Unassign ${label}`}
        className="shrink-0 rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 dark:hover:bg-red-900/20 dark:hover:text-red-400"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

export default function DraggableRulesList({
  ruleIds,
  labelFor,
  onChange,
  onRemove,
}: DraggableRulesListProps) {
  const sensors = useSensors(
    // 5 px activation distance so simple clicks on the handle don't
    // trigger a drag by accident.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = ruleIds.indexOf(String(active.id));
      const newIndex = ruleIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      onChange(arrayMove(ruleIds, oldIndex, newIndex));
    },
    [onChange, ruleIds],
  );

  if (ruleIds.length === 0) {
    return (
      <p className="py-4 text-center text-sm italic text-slate-400 dark:text-slate-500">
        No rules assigned yet.  Add one from the list below.
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ruleIds} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2" aria-label="Assigned rules in evaluation order">
          {ruleIds.map((id) => (
            <SortableItem
              key={id}
              id={id}
              label={labelFor(id)}
              onRemove={onRemove}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
