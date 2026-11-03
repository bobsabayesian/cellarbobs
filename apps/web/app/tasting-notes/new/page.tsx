"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { NoteEditor } from "@/components/tasting-notes/NoteEditor";
import { PageHeader } from "@/components/page/PageHeader";
import { parseIdParam } from "@/lib/functions/strings";

function NewTastingNoteForm() {
  const searchParams = useSearchParams();
  const vintageId = parseIdParam(searchParams.get("vintageId"));
  const wineId = parseIdParam(searchParams.get("wineId"));
  const returnTo =
    searchParams.get("returnTo") ??
    (vintageId
      ? `/vintages/${vintageId}`
      : wineId
        ? `/wines/${wineId}`
        : "/tasting-notes");

  return <NoteEditor vintageId={vintageId} returnTo={returnTo} />;
}

export default function NewTastingNotePage() {
  return (
    <section>
      <PageHeader title="New Tasting Note" />
      <Suspense>
        <NewTastingNoteForm />
      </Suspense>
    </section>
  );
}
