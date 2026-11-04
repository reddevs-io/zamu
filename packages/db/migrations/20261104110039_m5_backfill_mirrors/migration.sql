-- M5 data migration: fills labels, due dates, parents and blockers of every task that came from
-- Backlog.md (task.backlog_data set: mirrors, detached mirrors and imports, hidden tasks included)
-- from its stored block, with no activity rows and no updated_at change. Same rules as the refresh
-- planner (packages/core/src/backlog/plan.ts and fields.ts), so the next refresh of unchanged files
-- reports no change:
--   due date  backlog_data.dueDate when it is a real YYYY-MM-DD day, else none.
--   parent    backlog_data.parentId -> the task of the project with that backlog_id (visible rows
--             first, then the lowest id); none when there is none or it is the task itself.
--   blockers  each backlog_data.dependencies id, looked up the same way; unknown ids and the task
--             itself are left out.
--   labels    names trimmed, 1 to 40 characters, matched ignoring case. An existing label of the
--             project is reused (and its name locked, source backlog, while the project mirrors);
--             a new one takes the least used of the nine hues (ties: lowest number), in name
--             order, and is named after the first spelling in code point order. Labels of detached
--             projects and imports are app labels.
DO $$
DECLARE
  task_row record;
  project_row record;
  label_row record;
  dep text;
  target uuid;
  new_color smallint;
BEGIN
  -- Due dates ---------------------------------------------------------------------------------
  FOR task_row IN
    SELECT id, backlog_data->>'dueDate' AS due FROM task
    WHERE jsonb_typeof(backlog_data) = 'object'
      AND backlog_data->>'dueDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  LOOP
    BEGIN
      UPDATE task SET due_date = task_row.due::date
      WHERE id = task_row.id AND to_char(task_row.due::date, 'YYYY-MM-DD') = task_row.due;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      NULL; -- 2026-02-30, year 0: not a day, so no due date.
    END;
  END LOOP;

  -- Parents -----------------------------------------------------------------------------------
  FOR task_row IN
    SELECT id, project_id, backlog_data->>'parentId' AS parent FROM task
    WHERE jsonb_typeof(backlog_data->'parentId') = 'string'
  LOOP
    SELECT o.id INTO target FROM task o
    WHERE o.project_id = task_row.project_id AND o.backlog_id = task_row.parent
    ORDER BY (o.hidden_at IS NOT NULL), o.id
    LIMIT 1;
    IF target IS NOT NULL AND target <> task_row.id THEN
      UPDATE task SET parent_id = target WHERE id = task_row.id;
    END IF;
  END LOOP;

  -- Blockers ----------------------------------------------------------------------------------
  FOR task_row IN
    SELECT id, project_id, backlog_data->'dependencies' AS deps FROM task
    WHERE jsonb_typeof(backlog_data->'dependencies') = 'array'
  LOOP
    FOR dep IN SELECT jsonb_array_elements_text(task_row.deps) LOOP
      SELECT o.id INTO target FROM task o
      WHERE o.project_id = task_row.project_id AND o.backlog_id = dep
      ORDER BY (o.hidden_at IS NOT NULL), o.id
      LIMIT 1;
      IF target IS NOT NULL AND target <> task_row.id THEN
        INSERT INTO task_dependency (task_id, blocker_id) VALUES (task_row.id, target) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  -- Labels ------------------------------------------------------------------------------------
  FOR project_row IN
    SELECT pr.id AS project_id, pr.workspace_id,
      CASE WHEN s.mode = 'mirror' AND s.state <> 'detached' THEN 'backlog' ELSE 'app' END AS source
    FROM project pr
    LEFT JOIN backlog_source s ON s.project_id = pr.id
    WHERE EXISTS (
      SELECT 1 FROM task t
      WHERE t.project_id = pr.id AND jsonb_typeof(t.backlog_data->'labels') = 'array'
        AND t.backlog_data->'labels' <> '[]'::jsonb
    )
  LOOP
    FOR label_row IN
      SELECT lower(x.name) COLLATE "C" AS key, min(x.name COLLATE "C") AS name
      FROM (
        SELECT btrim(v.name) AS name
        FROM task t
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(t.backlog_data->'labels') = 'array' THEN t.backlog_data->'labels' ELSE '[]' END
        ) AS v(name)
        WHERE t.project_id = project_row.project_id
      ) x
      WHERE char_length(x.name) BETWEEN 1 AND 40
      GROUP BY 1
      ORDER BY 1
    LOOP
      IF EXISTS (SELECT 1 FROM label WHERE project_id = project_row.project_id AND lower(name) = label_row.key) THEN
        IF project_row.source = 'backlog' THEN
          UPDATE label SET source = 'backlog'
          WHERE project_id = project_row.project_id AND lower(name) = label_row.key AND source <> 'backlog';
        END IF;
      ELSE
        SELECT h.hue INTO new_color
        FROM generate_series(1, 9) AS h(hue)
        LEFT JOIN label o ON o.project_id = project_row.project_id AND o.color = h.hue
        GROUP BY h.hue
        ORDER BY count(o.id), h.hue
        LIMIT 1;
        INSERT INTO label (workspace_id, project_id, name, color, source)
        VALUES (project_row.workspace_id, project_row.project_id, label_row.name, new_color, project_row.source);
      END IF;
    END LOOP;

    INSERT INTO task_label (task_id, label_id)
    SELECT DISTINCT t.id, o.id
    FROM task t
    CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(t.backlog_data->'labels') = 'array' THEN t.backlog_data->'labels' ELSE '[]' END
        ) AS v(name)
    JOIN label o ON o.project_id = project_row.project_id AND lower(o.name) = lower(btrim(v.name))
    WHERE t.project_id = project_row.project_id
    ON CONFLICT DO NOTHING;
  END LOOP;
END
$$;
