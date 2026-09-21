import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bot, Check, ChevronRight, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react'
import { ASSISTANT_COPY, DIABETES_QUESTIONS } from './diabetesQuestions'

const STORAGE_KEY = 'diabetes-assistant-conversation:v1'

const CONVERSATION_STAGES = {
  INTRO: 'intro',
  TOPICS: 'topics',
  FOLLOW_UP: 'follow-up',
  COMPLETE: 'complete',
}

function createMessage(sender, text) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sender,
    text,
  }
}

function createInitialConversation() {
  return {
    stage: CONVERSATION_STAGES.INTRO,
    messages: [createMessage('bot', ASSISTANT_COPY.welcome)],
  }
}

function readStoredConversation() {
  if (typeof window === 'undefined') return createInitialConversation()

  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))
    const validStage = Object.values(CONVERSATION_STAGES).includes(stored?.stage)
    const validMessages =
      Array.isArray(stored?.messages)
      && stored.messages.length > 0
      && stored.messages.every(
        (message) =>
          typeof message?.id === 'string'
          && ['bot', 'user'].includes(message?.sender)
          && typeof message?.text === 'string',
      )

    if (validStage && validMessages) return stored
  } catch {
    // A malformed or unavailable session store should not prevent the assistant from opening.
  }

  return createInitialConversation()
}

function ChatMessage({ message }) {
  const isUser = message.sender === 'user'

  return (
    <div className={`flex items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <span
          className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-300"
          aria-hidden="true"
        >
          <Bot className="h-3.5 w-3.5" />
        </span>
      )}
      <div className={`max-w-[82%] ${isUser ? 'text-right' : 'text-left'}`}>
        <p className={`mb-1 text-[10px] font-bold uppercase text-slate-400 ${isUser ? 'pr-1' : 'pl-1'}`}>
          {isUser ? 'You' : 'Assistant'}
        </p>
        <div
          className={[
            'whitespace-pre-line px-3.5 py-2.5 text-left text-[13px] leading-5 shadow-sm',
            isUser
              ? 'rounded-2xl rounded-br-sm bg-cyan-700 text-white'
              : 'rounded-2xl rounded-bl-sm border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
          ].join(' ')}
        >
          {message.text}
        </div>
      </div>
    </div>
  )
}

function ChatOptions({ stage, onChooseIntro, onChooseQuestion, onChooseFollowUp, onBack }) {
  const choiceClass =
    'flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-cyan-700 dark:hover:bg-cyan-950 dark:hover:text-cyan-200 dark:focus:ring-offset-slate-900'

  if (stage === CONVERSATION_STAGES.INTRO) {
    return (
      <div>
        <p className="mb-2 text-xs font-bold text-slate-500 dark:text-slate-400">Choose an answer</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={choiceClass} onClick={() => onChooseIntro(true)}>
            <Check className="h-4 w-4" />
            Yes
          </button>
          <button type="button" className={choiceClass} onClick={() => onChooseIntro(false)}>
            <X className="h-4 w-4" />
            No
          </button>
        </div>
      </div>
    )
  }

  if (stage === CONVERSATION_STAGES.TOPICS) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Suggested questions</p>
          <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
            {DIABETES_QUESTIONS.length} topics
          </span>
        </div>
        <div className="space-y-1.5">
          {DIABETES_QUESTIONS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="group flex w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs font-semibold leading-4 text-slate-700 shadow-sm transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-cyan-700 dark:hover:bg-cyan-950 dark:hover:text-cyan-100 dark:focus:ring-offset-slate-900"
              onClick={() => onChooseQuestion(item)}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-extrabold text-slate-500 group-hover:bg-white group-hover:text-cyan-700 dark:bg-slate-700 dark:text-slate-300 dark:group-hover:bg-cyan-900 dark:group-hover:text-cyan-200">
                {index + 1}
              </span>
              <span className="flex-1">{item.question}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:translate-x-0.5 group-hover:text-cyan-600" />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      </div>
    )
  }

  if (stage === CONVERSATION_STAGES.FOLLOW_UP) {
    return (
      <div>
        <p className="mb-2 text-xs font-bold text-slate-500 dark:text-slate-400">Ask another question?</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={choiceClass} onClick={() => onChooseFollowUp(true)}>
            <Check className="h-4 w-4" />
            Yes
          </button>
          <button type="button" className={choiceClass} onClick={() => onChooseFollowUp(false)}>
            <X className="h-4 w-4" />
            No
          </button>
        </div>
      </div>
    )
  }

  return null
}

export function DiabetesAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [conversation, setConversation] = useState(readStoredConversation)
  const messageEndRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(conversation))
    } catch {
      // The conversation still works in memory when session storage is unavailable.
    }
  }, [conversation])

  useEffect(() => {
    if (isOpen) {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [conversation, isOpen])

  useEffect(() => {
    if (!isOpen) return undefined

    function closeOnEscape(event) {
      if (event.key === 'Escape') closeAssistant()
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isOpen])

  function appendMessages(messages, stage) {
    setConversation((current) => ({
      stage,
      messages: [...current.messages, ...messages],
    }))
  }

  function handleIntroChoice(hasQuestion) {
    if (hasQuestion) {
      appendMessages(
        [createMessage('user', 'Yes'), createMessage('bot', ASSISTANT_COPY.topicPrompt)],
        CONVERSATION_STAGES.TOPICS,
      )
      return
    }

    appendMessages(
      [createMessage('user', 'No'), createMessage('bot', ASSISTANT_COPY.initialDecline)],
      CONVERSATION_STAGES.COMPLETE,
    )
  }

  function handleQuestion(question) {
    appendMessages(
      [
        createMessage('user', question.question),
        createMessage('bot', question.answer),
        createMessage('bot', ASSISTANT_COPY.followUp),
      ],
      CONVERSATION_STAGES.FOLLOW_UP,
    )
  }

  function handleFollowUp(wantsAnotherQuestion) {
    if (wantsAnotherQuestion) {
      appendMessages(
        [createMessage('user', 'Yes'), createMessage('bot', ASSISTANT_COPY.topicPrompt)],
        CONVERSATION_STAGES.TOPICS,
      )
      return
    }

    appendMessages(
      [createMessage('user', 'No'), createMessage('bot', ASSISTANT_COPY.finished)],
      CONVERSATION_STAGES.COMPLETE,
    )
  }

  function handleBack() {
    appendMessages(
      [createMessage('user', 'Back'), createMessage('bot', 'Do you have any questions about diabetes?')],
      CONVERSATION_STAGES.INTRO,
    )
  }

  function restartConversation() {
    setConversation(createInitialConversation())
  }

  function closeAssistant() {
    setIsOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <div className="fixed bottom-4 right-3 z-[70] sm:bottom-6 sm:right-6">
      <section
        id="diabetes-assistant-panel"
        role="dialog"
        aria-label={ASSISTANT_COPY.title}
        aria-hidden={!isOpen}
        className={[
          'absolute bottom-[4.75rem] right-0 flex h-[38rem] max-h-[calc(100vh-6.5rem)] w-[calc(100vw-1.5rem)] max-w-[25rem] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_75px_-24px_rgba(15,23,42,0.5)] transition duration-300 ease-out dark:border-slate-700 dark:bg-slate-900',
          isOpen
            ? 'visible translate-y-0 scale-100 opacity-100'
            : 'invisible pointer-events-none translate-y-3 scale-95 opacity-0',
        ].join(' ')}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-600 to-cyan-700 text-white shadow-sm" aria-hidden="true">
              <Bot className="h-5 w-5" />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-extrabold text-slate-900 dark:text-white">{ASSISTANT_COPY.title}</h2>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                <Sparkles className="h-3 w-3 text-cyan-600" />
                Patient education
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={restartConversation}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
              aria-label="Restart conversation"
              title="Restart conversation"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={closeAssistant}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Close Diabetes Assistant"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          className="custom-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain bg-slate-50/80 p-4 dark:bg-slate-950"
        >
          {conversation.messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          <div ref={messageEndRef} />
        </div>

        <footer className="shrink-0 border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          {conversation.stage !== CONVERSATION_STAGES.COMPLETE && (
            <div className="custom-scrollbar max-h-64 overflow-y-auto overscroll-contain p-3">
              <ChatOptions
                stage={conversation.stage}
                onChooseIntro={handleIntroChoice}
                onChooseQuestion={handleQuestion}
                onChooseFollowUp={handleFollowUp}
                onBack={handleBack}
              />
            </div>
          )}
          <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 px-3 py-2 text-center text-[10px] font-medium text-slate-400 dark:border-slate-800 dark:text-slate-500">
            <ShieldCheck className="h-3 w-3 shrink-0" />
            General education only, not a medical diagnosis.
          </div>
        </footer>
      </section>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="relative ml-auto flex h-14 w-14 items-center justify-center rounded-full border border-cyan-500 bg-gradient-to-br from-sky-600 to-cyan-700 text-white shadow-[0_16px_38px_-12px_rgba(8,145,178,0.85)] transition duration-200 hover:-translate-y-0.5 hover:from-sky-700 hover:to-cyan-800 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-cyan-200 dark:focus:ring-cyan-900"
        aria-label={isOpen ? 'Close Diabetes Assistant' : 'Open Diabetes Assistant'}
        aria-expanded={isOpen}
        aria-controls="diabetes-assistant-panel"
        title={isOpen ? 'Close Diabetes Assistant' : 'Open Diabetes Assistant'}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Bot className="h-7 w-7" />}
        {!isOpen && <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-950" aria-hidden="true" />}
      </button>
    </div>
  )
}
