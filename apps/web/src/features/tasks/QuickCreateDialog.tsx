import type { Priority, TaskStatus } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
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
import { membersQuery, meQuery, projectsQuery, useCreateTask } from './queries';
import { assigneeOptions, ModKey, NO_ASSIGNEE, PRIORITY_OPTIONS, STATUS_OPTIONS } from './TaskFields';

// Quick create (frame 06). The shell renders it once and opens it with C (useQuickCreate().open). Title is
// focused; Mod+Enter creates; I assigns to me; with "Create more" on, the dialog stays open for the next
// task. Every new task is selected in its project's list.

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
  const { projectKey: requestedProject } = useQuickCreate();
  const navigate = useNavigate();
  const projects = useQuery(projectsQuery()).data?.items;
  const members = useQuery(membersQuery()).data?.items ?? [];
  const me = useQuery(meQuery()).data;
  const create = useCreateTask();

  // Projects come most recently active first, so the first one is the best guess without a current project.
  const [project, setProject] = useState<string | undefined>(requestedProject);
  const projectKey = project ?? projects?.[0]?.key;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(DEFAULT_STATUS);
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const [assignee, setAssignee] = useState<string>(NO_ASSIGNEE);
  const [createMore, setCreateMore] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // The Modal's focus scope runs after mount; focus the title once it settles.
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

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
        <Select
          aria-label="Project"
          variant="chip"
          items={projectItems}
          value={projectKey ?? null}
          onChange={(key) => key != null && setProject(String(key))}
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
            <Switch isSelected={createMore} onChange={setCreateMore}>
              Create more
            </Switch>
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
