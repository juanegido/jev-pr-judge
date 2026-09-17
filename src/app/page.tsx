import { JudgeContainer } from "./components/JudgeContainer";

export default function Home() {
  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6">
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            PR Judge — typed verdicts on pull requests with TypeSafe System One
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Paste a pull request. We build a bounded state from its title, body, and diff, ask a
            handful of typed questions in one parallel call to a System One model, and then run a
            plain, inspectable policy in code over the typed answers to reach a decision — no
            slow chained LLM-as-judge prompts.
          </p>
        </header>

        <JudgeContainer />
      </main>
    </div>
  );
}
