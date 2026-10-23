import type { Priority, TaskStatus } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useQuickCreate } from '~/features/shell/quick-create';
import {
  Banner,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Kbd,
  Modal,
  type OptionItem,
  Select,
  Switch,
  TextArea,
  TextField,
  useHotkeys,
} from '~/ui';
import { describeError } from './errors';
import {
  CyclePicker,
  CycleStateGlyph,
  cycleLabel,
  MilestonePicker,
  toCycleRef,
  toMilestoneRef,
  useProjectPlanning,
} from './PlanningFields';
import { membersQuery, meQuery, projectsQuery, useCreateTask } from './queries';
import { planningDefaultsFrom, resolveCycleDefault, resolveMilestoneDefault } from './quick-create-defaults';
import { assigneeOptions, ModKey, NO_ASSIGNEE, PRIORITY_OPTIONS, STATUS_OPTIONS } from './TaskFields';

// Quick create (frames 06 and 33). The shell renders it once and opens it with C (useQuickCreate().open).
// Title is focused; Mod+Enter creates; I assigns to me; Shift+M and Shift+C open the milestone and cycle
// chips (shown when the project uses them, prefilled from the page the dialog opened on); with "Create
// more" on, the dialog stays open for the next task. Every new task is selected in its project's list.
// open(projectKey, { status }) preselects the status for that opening (the board column's "+").

const DEFAULT_STATUS: TaskStatus = 'todo';
const DEFAULT_PRIORITY: Priority = 'none';

export function QuickCreateDialog() {
  const { isOpen, close } = useQuickCreate();
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      width={640}
      top={110}
    >
      {isOpen ? <QuickCreateForm onClose={close} /> : null}
    </Modal>
  );
}

function QuickCreateForm({ onClose }: { onClose: () => void }) {
  const { projectKey: requestedProject, status: requestedStatus, pickProject } = useQuickCreate();
  const navigate = useNavigate();
  // Read once: the page the dialog opened on decides the milestone and cycle defaults.
  const location = useRouterState({ select: (state) => state.location });
  const [pageDefaults] = useState(() =>
    planningDefaultsFrom(location.pathname, (location.search ?? {}) as Record<string, unknown>),
  );
  const projects = useQuery(projectsQuery()).data?.items;
  const members = useQuery(membersQuery()).data?.items ?? [];
  const me = useQuery(meQuery()).data;
  const create = useCreateTask();

  // Projects come most recently active first, so the first one is the best guess without a current project,
  // unless the opener asked for a choice (pickProject): then nothing is chosen until the person picks.
  const [project, setProject] = useState<string | undefined>(requestedProject);
  const projectKey = project ?? (pickProject ? undefined : projects?.[0]?.key);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(requestedStatus ?? DEFAULT_STATUS);
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const [assignee, setAssignee] = useState<string>(NO_ASSIGNEE);
  const [createMore, setCreateMore] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const projectPickerRef = useRef<HTMLSpanElement>(null);

  // Milestone and cycle: undefined follows the page default, null is "none", a string is the picked id.
  const planning = useProjectPlanning(projectKey);
  const [milestoneId, setMilestoneId] = useState<string | null | undefined>(undefined);
  const [cycleId, setCycleId] = useState<string | null | undefined>(undefined);
  const [openPicker, setOpenPicker] = useState<'milestone' | 'cycle' | null>(null);
  const onPageProject = projectKey != null && projectKey === pageDefaults.projectKey;
  const milestone =
    milestoneId === undefined
      ? onPageProject
        ? resolveMilestoneDefault(planning.milestones, pageDefaults.milestoneId)
        : undefined
      : planning.milestones?.find((item) => item.id === milestoneId);
  const cycle =
    cycleId === undefined
      ? onPageProject
        ? resolveCycleDefault(planning.cycles, pageDefaults.cycle)
        : undefined
      : planning.cycles?.find((item) => item.id === cycleId);
  const chosenMilestone = planning.usesMilestones ? milestone : undefined;
  const chosenCycle = planning.usesCycles ? cycle : undefined;
  const pickerOpenChange = (picker: 'milestone' | 'cycle') => (isOpen: boolean) =>
    setOpenPicker((current) => (isOpen ? picker : current === picker ? null : current));

  useEffect(() => {
    // The Modal's focus scope runs after mount; focus the title (or the project picker when the opener
    // left the project to choose) once it settles.
    const frame = requestAnimationFrame(() => {
      if (pickProject) projectPickerRef.current?.querySelector<HTMLElement>('button')?.focus();
      else titleRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [pickProject]);

  const assignToMe = () => {
    if (me) setAssignee(me.user.id);
  };

  const submit = async () => {
    if (create.isPending) return;
    if (!projectKey) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError('Give the task a title.');
      titleRef.current?.focus();
      return;
    }
    const task = await create
      .mutateAsync({
        project: projectKey,
        title: trimmed,
        ...(description.trim() ? { description } : {}),
        status,
        priority,
        assignee: assignee === NO_ASSIGNEE ? null : assignee,
        ...(chosenMilestone ? { milestone: chosenMilestone.id } : {}),
        ...(chosenCycle ? { cycle: chosenCycle.number } : {}),
      })
      .catch(() => null);
    if (!task) return;
    // Show the new task selected in its list.
    void navigate({
      to: '/p/$projectKey',
      params: { projectKey: task.project.key },
      search: { task: task.key } as never,
    });
    if (createMore) {
      setCreated(task.key);
      setTitle('');
      setDescription('');
      create.reset();
      titleRef.current?.focus();
    } else {
      onClose();
    }
  };

  useHotkeys(
    {
      'Mod+Enter': () => void submit(),
      i: assignToMe,
      'Shift+M': planning.usesMilestones ? () => setOpenPicker('milestone') : null,
      'Shift+C': planning.usesCycles ? () => setOpenPicker('cycle') : null,
    },
    { allowInOverlays: true },
  );

  const projectItems: OptionItem[] = (projects ?? []).map((item) => ({
    id: item.key,
    label: item.name,
    prefix: <span className="font-mono text-[10px]">{item.key}</span>,
  }));
  const error = create.isError ? describeError(create.error) : null;

  return (
    <Dialog aria-label="New task">
      <DialogHeader>
        <span ref={projectPickerRef} className="contents">
          <Select
            aria-label="Project"
            variant="chip"
            items={projectItems}
            value={projectKey ?? null}
            onChange={(key) => {
              if (key == null || String(key) === projectKey) return;
              // The first pick of a dialog opened without a project moves on to the title.
              if (projectKey === undefined) setTimeout(() => titleRef.current?.focus(), 0);
              setProject(String(key));
              // Milestones and cycles belong to one project: start over in the new one.
              setMilestoneId(undefined);
              setCycleId(undefined);
            }}
            placeholder="Project"
            renderValue={(selected) => {
              const [item] = selected;
              return item ? (
                <span className="flex items-center gap-[7px]">
                  <span className="font-mono text-[10px]">{item.id}</span>
                  {item.label}
                </span>
              ) : (
                <span className="text-faint">Project</span>
              );
            }}
          />
        </span>
        <span className="text-faint">New task</span>
        {created ? <span className="text-[12px] text-muted">Created {created}</span> : null}
      </DialogHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="contents"
      >
        <DialogBody className="gap-4 px-5 pt-[18px] pb-5">
          <TextField
            aria-label="Title"
            placeholder="Task title"
            value={title}
            onChange={(value) => {
              setTitle(value);
              if (titleError) setTitleError(null);
            }}
            inputRef={titleRef}
            isInvalid={titleError != null}
            errorMessage={titleError}
            inputClassName="h-auto border-0 bg-transparent px-0 text-[18px] font-semibold focus:shadow-none"
          />
          <TextArea
            aria-label="Description"
            placeholder="Add a description. Markdown works."
            value={description}
            onChange={setDescription}
          />
          <div className="flex flex-wrap gap-1.5">
            <Select
              aria-label="Status"
              variant="chip"
              items={STATUS_OPTIONS}
              value={status}
              onChange={(key) => key != null && setStatus(String(key) as TaskStatus)}
            />
            <Select
              aria-label="Priority"
              variant="chip"
              items={PRIORITY_OPTIONS}
              value={priority}
              onChange={(key) => key != null && setPriority(String(key) as Priority)}
            />
            <Select
              aria-label="Assignee"
              variant="chip"
              items={assigneeOptions(members)}
              value={assignee}
              onChange={(key) => key != null && setAssignee(String(key))}
            />
            {planning.usesMilestones ? (
              <MilestonePicker
                look="chip"
                value={chosenMilestone ? toMilestoneRef(chosenMilestone) : null}
                milestones={planning.milestones}
                onChange={(picked) => setMilestoneId(picked?.id ?? null)}
                isOpen={openPicker === 'milestone'}
                onOpenChange={pickerOpenChange('milestone')}
              />
            ) : null}
            {planning.usesCycles ? (
              <CyclePicker
                look="chip"
                value={chosenCycle ? toCycleRef(chosenCycle) : null}
                cycles={planning.cycles}
                onChange={(picked) => setCycleId(picked?.id ?? null)}
                isOpen={openPicker === 'cycle'}
                onOpenChange={pickerOpenChange('cycle')}
              >
                {chosenCycle ? (
                  <>
                    <CycleStateGlyph cycle={chosenCycle} />
                    {cycleLabel(chosenCycle)}
                  </>
                ) : (
                  <span className="text-faint">Cycle</span>
                )}
              </CyclePicker>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-[7px] px-2.5 text-[12.5px] font-normal text-faint"
              onPress={assignToMe}
              isDisabled={!me || assignee === me.user.id}
              aria-keyshortcuts="i"
            >
              Assign to me
              <Kbd>I</Kbd>
            </Button>
          </div>
          {error ? (
            <Banner>
              Couldn't create the task. {error.message}
              {error.requestId ? (
                <>
                  {' '}
                  Request <code className="font-mono text-[11px]">{error.requestId}</code>.
                </>
              ) : null}
            </Banner>
          ) : null}
        </DialogBody>
        <DialogFooter
          start={
            <>
              <Switch isSelected={createMore} onChange={setCreateMore} className="shrink-0 whitespace-nowrap">
                Create more
              </Switch>
              {planning.usesMilestones || planning.usesCycles ? (
                <span className="min-w-0 truncate text-[11.5px] text-faint">
                  Milestone and cycle default to the page you opened this from.
                </span>
              ) : null}
            </>
          }
        >
          <Button variant="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button type="submit" isPending={create.isPending} isDisabled={!projectKey}>
            Create task
            <Kbd variant="inverse" aria-hidden>
              <ModKey />↵
            </Kbd>
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
