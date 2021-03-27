// import { pathToFileURL } from 'node:url';
// import { setFlagsFromString } from 'node:v8';
import * as path from 'path';
import * as vscode from 'vscode';
import * as ipc from 'node-ipc';

ipc.config.id = 'client';
ipc.config.retry = 1000;

ipc.connectTo('furby', () => {
  ipc.of.furby.on('connect', () => {
    ipc.log('## VS Code Connected to furby ##', {config: ipc.config});
    ipc.of.furby.emit('app.message', {
      id: ipc.config.id,
      message: {
        type: 'open',
        path: 'file:///dev/vs-code-extension'
      }
    });
  });

  ipc.of.furby.on('disconnect', () => {
    ipc.log('Disconnected from furby');
  });

  ipc.of.furby.on('app.message', (data: any) => {
    ipc.log('Got a message from furby: ', data);
  });

  console.log(ipc.of.furby.destroy);
});

export function activate(context: vscode.ExtensionContext) {
  console.log('"Furby" extension is now active!');

  let furbyEnabled: boolean = true;

  const updateStatusForUri = ( uriToDecorate : vscode.Uri ) => {
    if (!uriToDecorate) {return;}

    // Only process "file://" URIs.
    if(uriToDecorate.scheme !== "file" ) {return;}

    if(!vscode.window ) {return;}

    const activeTextEditor : vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if( !activeTextEditor )
    {
        return;
    }

    if ( !activeTextEditor.document.uri.fsPath )
    {
        return;
    }

    let numErrors = 0;
    let numWarnings = 0;

    if (furbyEnabled) {
      let diagnostic: vscode.Diagnostic;
      for (diagnostic of vscode.languages.getDiagnostics(uriToDecorate)) {
          switch (diagnostic.severity) {
              case 0:
                  numErrors += 1;
                  break;

              case 1:
                  numWarnings += 1;
                  break;

              // Ignore other severities for now
          }
      }
    }

    console.log({numErrors, numWarnings});
  };


  let disposableEnable = vscode.commands.registerCommand('Furby.enable', () => {
    furbyEnabled = true;

    const activeTextEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (activeTextEditor) {
        updateStatusForUri(activeTextEditor.document.uri);
    }
  });

  let disposableDisable = vscode.commands.registerCommand('Furby.disable', () => {
      furbyEnabled = false;

      const activeTextEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
      if (activeTextEditor) {
          updateStatusForUri(activeTextEditor.document.uri);
      }
  });

  let disposableHello = vscode.commands.registerCommand('Furby.hello', () => {
    // Display a message box to the user
    vscode.window.showInformationMessage('Hello World from furby!');
  });

  context.subscriptions.push(disposableEnable);
  context.subscriptions.push(disposableDisable);
  context.subscriptions.push(disposableHello);

  vscode.workspace.onDidOpenTextDocument(textDocument => {
    console.log(`onDidOpenTextDocument ${file(textDocument.uri.fsPath)}`);

    updateStatusForUri( textDocument.uri );
  }, null, context.subscriptions );

  vscode.workspace.onDidCloseTextDocument(textDocument => {
    console.log(`onDidCloseTextDocument ${file(textDocument.uri.fsPath)}`);

    updateStatusForUri( textDocument.uri );
  }, null, context.subscriptions );

  vscode.window.onDidChangeTextEditorSelection(event => {
		// Ignore multi-cursor/multi-selection scenarios
		if (event.selections.length !== 1) {return;};
		const sel = event.selections[0];

		// Ignore scenarios where there is selected text
		if (sel.start.line !== sel.end.line || sel.start.character !== sel.end.character) { return; }

		console.log({line: sel.start.line, char: sel.start.character});
	}, null, context.subscriptions );

  vscode.workspace.onDidChangeTextDocument(event => {
    console.log(`onDidChangeTextDocument ${file(event.document.uri.fsPath)}`);

    updateStatusForUri( event.document.uri );
  }, null, context.subscriptions );

  vscode.window.onDidChangeActiveTextEditor(textEditor => {
    if (textEditor === undefined) {
      return;
    }
    console.log(`onDidChangeActiveTextEditor ${file(textEditor.document.uri.fsPath)}`);

		updateStatusForUri(textEditor.document.uri );
  }, null, context.subscriptions);

  vscode.languages.onDidChangeDiagnostics(diagnosticChangeEvent => {
    if (!vscode.window) { return; }

    const activeTextEditor : vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (!activeTextEditor) { return; }

    // Only monitor the active text editor
    for (const uri of diagnosticChangeEvent.uris)
    {
       if (uri.fsPath === activeTextEditor.document.uri.fsPath)
       {
  				console.log(`onDidChangeDiagnostics ${file(uri.fsPath)}`);

           updateStatusForUri( uri );
           break;
       }
    }
  }, null, context.subscriptions );

}

const file = (uri: string) => {
	return path.basename(uri);
};

// this method is called when your extension is deactivated
export function deactivate() {}
