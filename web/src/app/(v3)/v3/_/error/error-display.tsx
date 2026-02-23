import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBug,
  IconRefresh,
} from "@tabler/icons-react"
import { useRouter } from "next/navigation"

import { Button } from "@v3/_/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import { cn } from "@v3/_/lib/utils"

const GITLAB_ISSUES_URL =
  "https://gitlab.com/storyteller-platform/storyteller/-/issues/new"

type ErrorDisplayProps = {
  error: unknown
  fullPage?: boolean
  className?: string
}

function getErrorInfo(error: unknown): { title: string; message: string } {
  if (error instanceof Error) {
    return {
      title: "Something went wrong",
      message: error.message,
    }
  }

  return {
    title: "Unknown error",
    message: "An unexpected error occurred.",
  }
}

function getErrorStack(error: unknown): string | null {
  if (error instanceof Error && error.stack) {
    return error.stack
  }
  return null
}

function buildIssueUrl(error: unknown): string {
  const { title, message } = getErrorInfo(error)
  const stack = getErrorStack(error)

  const issueTitle = encodeURIComponent(`[Bug] ${title}`)
  const issueBody = encodeURIComponent(
    [
      "## Description",
      message,
      "",
      "## Steps to reproduce",
      "1. ",
      "",
      "## Expected behavior",
      "",
      "## Actual behavior",
      "",
      stack ? `## Stack trace\n\`\`\`\n${stack}\n\`\`\`` : "",
      "",
      "## Environment",
      `- URL: ${typeof window !== "undefined" ? window.location.href : "N/A"}`,
      `- User Agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "N/A"}`,
    ]
      .filter(Boolean)
      .join("\n"),
  )

  return `${GITLAB_ISSUES_URL}?issue[title]=${issueTitle}&issue[description]=${issueBody}`
}

export function ErrorDisplay({
  error,
  fullPage = false,
  className,
}: ErrorDisplayProps) {
  const router = useRouter()
  const { title, message } = getErrorInfo(error)
  const stack = getErrorStack(error)

  const handleGoBack = () => {
    router.back()
  }

  const handleRefresh = () => {
    window.location.reload()
  }

  if (fullPage) {
    return (
      <div
        className={cn(
          "flex min-h-svh items-center justify-center p-4",
          className,
        )}
      >
        <ErrorCard
          title={title}
          message={message}
          stack={stack}
          error={error}
          onGoBack={handleGoBack}
          onRefresh={handleRefresh}
        />
      </div>
    )
  }

  return (
    <div
      className={cn("flex flex-1 items-center justify-center p-4", className)}
    >
      <ErrorCard
        title={title}
        message={message}
        stack={stack}
        error={error}
        onGoBack={handleGoBack}
        onRefresh={handleRefresh}
      />
    </div>
  )
}

type ErrorCardProps = {
  title: string
  message: string
  stack: string | null
  error: unknown
  onGoBack: () => void
  onRefresh: () => void
}

function ErrorCard({
  title,
  message,
  stack,
  error,
  onGoBack,
  onRefresh,
}: ErrorCardProps) {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-full">
            <IconAlertTriangle className="size-5" />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1">{message}</CardDescription>
          </div>
        </div>
      </CardHeader>
      {stack && (
        <CardContent>
          <details className="group">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
              Show technical details
            </summary>
            <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-3 text-xs">
              {stack}
            </pre>
          </details>
        </CardContent>
      )}
      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onGoBack}>
          <IconArrowLeft />
          Go back
        </Button>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <IconRefresh />
          Refresh
        </Button>
        <Button
          variant="default"
          size="sm"
          render={
            <a
              href={buildIssueUrl(error)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBug />
              Report issue
            </a>
          }
        />
      </CardFooter>
    </Card>
  )
}
