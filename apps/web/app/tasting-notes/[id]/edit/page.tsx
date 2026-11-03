"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page/PageHeader";
import { getTastingNoteById } from "@/lib/api/tastingNotes";
import { NoteEditor } from "@/components/tasting-notes/NoteEditor";
import { useApiQuery } from "@/hooks/use-api-query";
import { queryGate } from "@/lib/functions/query-gate";

export default function EditTastingNotePage() {
  const params = useParams();
  const noteId = Number(params.id);

  const noteQuery = useApiQuery({
    queryKey: ["tastingNote", noteId],
    queryFn: () => getTastingNoteById(noteId),
    enabled: !!noteId,
  });

  const result = queryGate([noteQuery]);
  if (!result.ready) return result.gate;

  const [note] = result.data;

  return (
    <section>
      <PageHeader title="Edit Tasting Note" />
      <NoteEditor note={note} returnTo={`/vintages/${note.vintageId}`} />
    </section>
  );
}
