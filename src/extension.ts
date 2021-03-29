import * as vscode from 'vscode'
import * as ipc from 'node-ipc'

export function activate(context: vscode.ExtensionContext): void {
  console.log('"Furby" extension is now active!')
  let enabled = true
  let connected = false

  // A map of open files with a boolean indicating whether or not they have been activated
  const opened: {[path: string]: boolean} = {}

  // A map of open files and current selections
  const selections: {[path: string]: vscode.Selection} = {}

  ipc.config.id = 'vscode-furby'
  ipc.config.retry = 1000
  ipc.connectTo('furby', () => {
    ipc.of.furby.on('connect', () => {
      ipc.log('## Connected to furby ##', {config: ipc.config})
      connected = true
    })

    ipc.of.furby.on('disconnect', () => {
      ipc.log('Disconnected from furby')
      connected = false
    })

    // ipc.of.furby.on('app.message', (data: any) => {
    //   ipc.log('Got a message from furby: ', data);
    // });
    //
    // console.log(ipc.of.furby.destroy);
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notify = (message: any) => {
    if (!connected) {
      return
    }
    ipc.of.furby.emit('app.message', {
      id: ipc.config.id,
      message: message,
    })
  }

  const updateStatusForUri = (uri: vscode.Uri) => {
    if (!enabled) return
    if (!uri) return
    if (uri.scheme !== 'file') return
    if (!vscode.window) return

    const activeTextEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor
    if (!activeTextEditor || !activeTextEditor.document.uri.fsPath) return

    let numErrors = 0
    let numWarnings = 0
    let diagnostic: vscode.Diagnostic
    for (diagnostic of vscode.languages.getDiagnostics(uri)) {
      switch (diagnostic.severity) {
        case 0:
          numErrors += 1
          break
        case 1:
          numWarnings += 1
          break
      }
    }

    // For now we are only reporting error severity in the count
    notify({
      type: 'linter',
      count: numErrors,
      errors: numErrors,
      warnings: numWarnings,
    })
  }

  const disposableEnable = vscode.commands.registerCommand('Furby.enable', () => {
    enabled = true

    const activeTextEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor
    if (activeTextEditor) {
      updateStatusForUri(activeTextEditor.document.uri)
    }
  })

  const disposableDisable = vscode.commands.registerCommand('Furby.disable', () => {
    enabled = false

    const activeTextEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor
    if (activeTextEditor) {
      updateStatusForUri(activeTextEditor.document.uri)
    }
  })

  const disposableHello = vscode.commands.registerCommand('Furby.hello', () => {
    vscode.window.showInformationMessage('Hello World from furby!')
  })

  context.subscriptions.push(disposableEnable)
  context.subscriptions.push(disposableDisable)
  context.subscriptions.push(disposableHello)

  vscode.workspace.onDidOpenTextDocument(
    (textDocument) => {
      const uri = textDocument.uri
      if (!uri) return
      if (uri.scheme !== 'file') return

      // We don't fire a notify event here for open because VSCode fires this event
      // for documents that are never actually activated (such as tsconfig.json)
      // Instead, we record that the document was opened but has not yet been activated
      opened[uri.fsPath] = false
    },
    null,
    context.subscriptions,
  )

  vscode.workspace.onDidCloseTextDocument(
    (textDocument) => {
      const uri = textDocument.uri
      if (!uri) return
      if (uri.scheme !== 'file') return

      delete opened[uri.fsPath]
      delete selections[uri.fsPath]
      notify({
        type: 'close',
        path: uri.fsPath,
      })
    },
    null,
    context.subscriptions,
  )

  vscode.window.onDidChangeTextEditorSelection(
    (event) => {
      const uri = event.textEditor?.document.uri
      if (!uri) return
      if (uri.scheme !== 'file') return

      // Only worry about selections in the active editor
      if (vscode.window.activeTextEditor !== event.textEditor) return

      // Ignore multi-cursor/multi-selection scenarios
      if (event.selections.length !== 1) return
      const sel = event.selections[0]

      // Ignore scenarios where there is selected text, report single cursor only
      if (sel.start.line !== sel.end.line || sel.start.character !== sel.end.character) {
        return
      }

      if (!selections[uri.fsPath]) {
        selections[uri.fsPath] = sel
      }

      notify({
        type: 'cursor',
        previous: {
          line: selections[uri.fsPath].start.line,
          character: selections[uri.fsPath].start.character,
        },
        current: {
          line: sel.start.line,
          character: sel.start.character,
        },
      })

      selections[uri.fsPath] = sel
    },
    null,
    context.subscriptions,
  )

  vscode.window.onDidChangeActiveTextEditor(
    (textEditor) => {
      const uri = textEditor?.document?.uri
      if (!uri) return
      if (uri.scheme !== 'file') return

      // Check if this is the first time this document is activated
      if (!opened[uri.fsPath]) {
        opened[uri.fsPath] = true
        notify({
          type: 'open',
          path: uri.fsPath,
        })
      }

      notify({
        type: 'active',
        path: uri.fsPath,
      })

      updateStatusForUri(uri)
    },
    null,
    context.subscriptions,
  )

  // This is called whenever the linting status is changed
  vscode.languages.onDidChangeDiagnostics(
    (diagnosticChangeEvent) => {
      if (!vscode.window.activeTextEditor) return

      const uri = vscode.window.activeTextEditor.document?.uri
      if (!uri) return
      if (uri.scheme !== 'file') return

      // Only update status if the diagnostics of the active text editor changed
      for (const diagnosticUri of diagnosticChangeEvent.uris) {
        if (diagnosticUri.fsPath === uri.fsPath) {
          updateStatusForUri(uri)
          break
        }
      }
    },
    null,
    context.subscriptions,
  )

  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      const uri = event.document?.uri
      if (!uri) return
      if (uri.scheme !== 'file') return

      // Notify all of the changes
      for (let i = 0; i < event.contentChanges.length; i++) {
        const changeEvent: vscode.TextDocumentContentChangeEvent = event.contentChanges[i]
        const line = changeEvent.range.start.line
        const lineText = event.document.lineAt(line).text
        notify({
          type: 'change',
          change: changeEvent.text,
          line: lineText,
        })
      }

      updateStatusForUri(uri)
    },
    null,
    context.subscriptions,
  )
}

export function deactivate(): void {
  // Do nothing
}
