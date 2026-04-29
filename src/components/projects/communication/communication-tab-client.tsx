"use client"

import { Inbox, MessageSquare } from "lucide-react"
import * as React from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { ChatPanel } from "./chat-panel"
import { OutboxPanel } from "./outbox-panel"

interface CommunicationTabClientProps {
  projectId: string
  emailStubMode: boolean
}

export function CommunicationTabClient({
  projectId,
  emailStubMode,
}: CommunicationTabClientProps) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Kommunikation</h1>
        <p className="text-sm text-muted-foreground">
          Outbox für Drafts und Versand sowie ein interner Projekt-Chat.
        </p>
      </header>
      <Tabs defaultValue="outbox">
        <TabsList>
          <TabsTrigger value="outbox">
            <Inbox className="mr-2 h-4 w-4" aria-hidden /> Outbox
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageSquare className="mr-2 h-4 w-4" aria-hidden /> Chat
          </TabsTrigger>
        </TabsList>
        <TabsContent value="outbox" className="mt-6">
          <OutboxPanel projectId={projectId} emailStubMode={emailStubMode} />
        </TabsContent>
        <TabsContent value="chat" className="mt-6">
          <ChatPanel projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
