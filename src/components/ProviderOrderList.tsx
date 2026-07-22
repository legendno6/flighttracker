import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FlightProvider } from '../providers/FlightProvider';
import type { ProviderPreferences } from '../types/settings';
import { GripIcon } from './icons/GripIcon';
import { LockIcon } from './icons/LockIcon';
import { cn } from '../utils/classNames';

interface ProviderOrderListProps {
  /** Providers the user can drag to reorder. */
  providers: FlightProvider[];
  /** Providers whose position is fixed at the end of the list (still toggleable, not draggable). */
  pinnedProviders: FlightProvider[];
  preferences: ProviderPreferences;
  onChange: (preferences: ProviderPreferences) => void;
}

export function ProviderOrderList({ providers, pinnedProviders, preferences, onChange }: ProviderOrderListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const orderedIds = [
    ...preferences.order.filter((id) => providers.some((p) => p.id === id)),
    ...providers.map((p) => p.id).filter((id) => !preferences.order.includes(id)),
  ];
  const byId = new Map(providers.map((p) => [p.id, p]));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    const reordered = [...orderedIds];
    reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, String(active.id));
    // Persisted order always ends with the pinned providers, regardless of drag result.
    onChange({ ...preferences, order: [...reordered, ...pinnedProviders.map((p) => p.id)] });
  }

  function toggleEnabled(id: string) {
    onChange({
      ...preferences,
      enabled: { ...preferences.enabled, [id]: !(preferences.enabled[id] ?? true) },
    });
  }

  return (
    <div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Tried in this order for each lookup — drag to reorder, uncheck to skip a provider entirely.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <ul className="mt-2 space-y-2">
            {orderedIds.map((id) => {
              const provider = byId.get(id);
              if (!provider) return null;
              return (
                <ProviderRow
                  key={id}
                  id={id}
                  displayName={provider.displayName}
                  configured={provider.isConfigured()}
                  enabled={preferences.enabled[id] ?? true}
                  onToggle={() => toggleEnabled(id)}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>

      {pinnedProviders.length > 0 && (
        <ul className="mt-2 space-y-2">
          {pinnedProviders.map((provider) => (
            <li
              key={provider.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
            >
              <span
                title="Always tried last — provides only live position, not gates/terminals/schedules"
                className="flex min-h-[44px] min-w-[32px] items-center justify-center text-slate-300 dark:text-slate-600"
              >
                <LockIcon />
              </span>

              <label className="flex flex-1 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={preferences.enabled[provider.id] ?? true}
                  onChange={() => toggleEnabled(provider.id)}
                  className="h-5 w-5 rounded"
                />
                <span className="font-medium">{provider.displayName}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">(always last)</span>
              </label>

              {!provider.isConfigured() && (
                <span className="text-xs text-slate-400 dark:text-slate-500">not configured</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ProviderRowProps {
  id: string;
  displayName: string;
  configured: boolean;
  enabled: boolean;
  onToggle: () => void;
}

function ProviderRow({ id, displayName, configured, enabled, onToggle }: ProviderRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50',
        isDragging && 'opacity-60',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${displayName}`}
        className="flex min-h-[44px] min-w-[32px] cursor-grab items-center justify-center text-slate-400 active:cursor-grabbing"
      >
        <GripIcon />
      </button>

      <label className="flex flex-1 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          className="h-5 w-5 rounded"
          aria-describedby={!configured ? `${id}-unconfigured` : undefined}
        />
        <span className="font-medium">{displayName}</span>
      </label>

      {!configured && (
        <span id={`${id}-unconfigured`} className="text-xs text-slate-400 dark:text-slate-500">
          not configured
        </span>
      )}
    </li>
  );
}
