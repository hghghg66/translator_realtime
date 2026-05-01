import { useEffect, useRef } from 'react';

export function TranscriptView({
  finalText,
  provisionalText,
  empty,
}: {
  finalText: string;
  provisionalText: string;
  empty?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // auto-scroll only if user is near bottom
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [finalText, provisionalText]);

  return (
    <div className="transcript" ref={ref}>
      {finalText || (!provisionalText && (empty ?? ''))}
      {provisionalText && <span className="provisional">{provisionalText}</span>}
    </div>
  );
}
