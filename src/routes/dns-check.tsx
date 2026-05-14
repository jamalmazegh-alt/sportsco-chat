import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'

export const Route = createFileRoute('/dns-check')({
  component: DnsCheckPage,
  head: () => ({
    meta: [{ title: 'DNS propagation check — clubero.app' }],
  }),
})

const EXPECTED_A = '185.158.133.1'
const HOSTS = ['clubero.app', 'www.clubero.app'] as const
const RESOLVERS = [
  { name: 'Google', url: 'https://dns.google/resolve' },
  { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
] as const

type CheckResult = {
  resolver: string
  host: string
  type: 'A' | 'TXT'
  values: string[]
  ok: boolean
  error?: string
}

async function resolve(
  resolver: (typeof RESOLVERS)[number],
  host: string,
  type: 'A' | 'TXT',
): Promise<CheckResult> {
  try {
    const res = await fetch(
      `${resolver.url}?name=${encodeURIComponent(host)}&type=${type}`,
      { headers: { Accept: 'application/dns-json' } },
    )
    const json: { Answer?: Array<{ data: string }> } = await res.json()
    const values = (json.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, ''))
    const ok =
      type === 'A'
        ? values.includes(EXPECTED_A)
        : values.some((v) => v.includes('lovable_verify='))
    return { resolver: resolver.name, host, type, values, ok }
  } catch (e) {
    return {
      resolver: resolver.name,
      host,
      type,
      values: [],
      ok: false,
      error: e instanceof Error ? e.message : 'Failed',
    }
  }
}

function DnsCheckPage() {
  const [results, setResults] = useState<CheckResult[]>([])
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState<Date | null>(null)

  const runChecks = useCallback(async () => {
    setLoading(true)
    const tasks: Promise<CheckResult>[] = []
    for (const resolver of RESOLVERS) {
      for (const host of HOSTS) tasks.push(resolve(resolver, host, 'A'))
      tasks.push(resolve(resolver, '_lovable.clubero.app', 'TXT'))
    }
    const all = await Promise.all(tasks)
    setResults(all)
    setLastRun(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    runChecks()
  }, [runChecks])

  const aChecks = results.filter((r) => r.type === 'A')
  const allActive =
    aChecks.length > 0 &&
    HOSTS.every((h) =>
      aChecks.filter((r) => r.host === h).every((r) => r.ok),
    )

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            DNS propagation check
          </h1>
          <p className="text-muted-foreground">
            Verifies that <code>clubero.app</code> and{' '}
            <code>www.clubero.app</code> resolve to{' '}
            <code>{EXPECTED_A}</code> across public resolvers.
          </p>
        </header>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : allActive ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <XCircle className="h-6 w-6 text-orange-500" />
              )}
              <div>
                <p className="font-semibold">
                  {loading
                    ? 'Checking…'
                    : allActive
                      ? 'Both hosts fully propagated'
                      : 'Not yet fully active'}
                </p>
                {lastRun && (
                  <p className="text-xs text-muted-foreground">
                    Last checked {lastRun.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
            <Button onClick={runChecks} disabled={loading} size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Recheck
            </Button>
          </div>
        </Card>

        <div className="space-y-3">
          {results.map((r, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{r.resolver}</Badge>
                    <Badge variant="secondary">{r.type}</Badge>
                    <code className="truncate text-sm">{r.host}</code>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {r.values.length === 0
                      ? r.error || 'No records returned'
                      : r.values.join(', ')}
                  </div>
                </div>
                {r.ok ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-orange-500" />
                )}
              </div>
            </Card>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          DNS changes can take up to 72h. SSL is provisioned automatically once
          both A records resolve to {EXPECTED_A}.
        </p>
      </div>
    </div>
  )
}
