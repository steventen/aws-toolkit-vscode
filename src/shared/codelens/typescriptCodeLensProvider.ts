/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { findFileInParentPaths } from '../filesystemUtilities'

import {
    CodeLensProviderParams,
    getInvokeCmdKey,
    makeCodeLenses
} from './codeLensUtils'
import { LambdaLocalInvokeArguments, LocalLambdaRunner } from './localLambdaRunner'

import { NodeDebugConfiguration } from '../../lambda/local/nodeDebugConfiguration'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import {
    DefaultSamCliProcessInvoker,
    DefaultSamCliTaskInvoker,
} from '../sam/cli/samCliInvoker'
import {  TypescriptLambdaHandlerSearch } from '../typescriptLambdaHandlerSearch'

export const getSamNodeProjectDirPath = async (): Promise<string> => {
    const activeFilePath = vscode.window.activeTextEditor!.document.uri.fsPath
    if (!activeFilePath) {
      throw new Error('"vscode.window.activeTextEditor" not defined')
    }
    const packageJsonPath: string | undefined = await findFileInParentPaths(
        path.dirname(activeFilePath),
        'package.json'
    )
    if (!packageJsonPath) {
        throw new Error(
            localize(
                'AWS.error.sam.local.package_json_not_found',
                'Unable to find package.json related to {0}',
                activeFilePath
            )
        )
    }

    return path.dirname(packageJsonPath)
}

export const initialize = ({
    configuration,
    toolkitOutputChannel,
    processInvoker = new DefaultSamCliProcessInvoker(),
    taskInvoker = new DefaultSamCliTaskInvoker()
}: CodeLensProviderParams): void => {
    vscode.commands.registerCommand(
        getInvokeCmdKey('javascript'),
        async (args: LambdaLocalInvokeArguments) => {
            let debugPort: number | undefined

            if (args.debug) {
                debugPort = 5858
            }

            const samProjectCodeRoot = await getSamNodeProjectDirPath()
            const debugConfig: NodeDebugConfiguration = {
                type: 'node',
                request: 'attach',
                name: 'SamLocalDebug',
                preLaunchTask: undefined,
                address: 'localhost',
                port: debugPort!,
                localRoot: samProjectCodeRoot,
                remoteRoot: '/var/task',
                protocol: 'inspector',
                skipFiles: [
                    '/var/runtime/node_modules/**/*.js',
                    '<node_internals>/**/*.js'
                ]
            }

            const localLambdaRunner: LocalLambdaRunner = new LocalLambdaRunner(
                configuration,
                args,
                debugPort,
                'nodejs8.10', // TODO: Remove hard coded value
                toolkitOutputChannel,
                processInvoker,
                taskInvoker,
                debugConfig,
                samProjectCodeRoot

            )

            await localLambdaRunner.run()
        }
    )
}

export const makeTypescriptCodeLensProvider =  (): vscode.CodeLensProvider => {
    return { // CodeLensProvider
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const search: TypescriptLambdaHandlerSearch = new TypescriptLambdaHandlerSearch(document.uri)
            const handlers: LambdaHandlerCandidate[] = await search.findCandidateLambdaHandlers()

            return makeCodeLenses({
                                      document,
                                      handlers,
                                      token,
                                      lang: 'javascript'
                                  })
        },
        resolveCodeLens: (
            codeLens: vscode.CodeLens,
            token: vscode.CancellationToken
        ): vscode.ProviderResult<vscode.CodeLens> => {
            throw new Error('not implemented')
        }
    }
}
