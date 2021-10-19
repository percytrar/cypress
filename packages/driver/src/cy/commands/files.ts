// @ts-nocheck
import _ from 'lodash'
import Promise from 'bluebird'

import $errUtils from '../../cypress/error_utils'

export default (Commands, Cypress, cy) => {
  Commands.addAll({
    readFile (file, encoding, options = {}) {
      let userOptions = options

      if (_.isObject(encoding)) {
        userOptions = encoding
        encoding = undefined
      }

      options = _.defaults({}, userOptions, {
        // https://github.com/cypress-io/cypress/issues/1558
        // If no encoding is specified, then Cypress has historically defaulted
        // to `utf8`, because of it's focus on text files. This is in contrast to
        // NodeJs, which defaults to binary. We allow users to pass in `null`
        // to restore the default node behavior.
        encoding: encoding === undefined ? 'utf8' : encoding,
        log: true,
      })

      const consoleProps = {}

      if (options.log) {
        options._log = Cypress.log({
          message: file,
          timeout: options.timeout,
          consoleProps () {
            return consoleProps
          },
        })
      }

      if (!file || !_.isString(file)) {
        $errUtils.throwErrByPath('files.invalid_argument', {
          onFail: options._log,
          args: { cmd: 'readFile', file },
        })
      }

      const verifyAssertions = () => {
        return Cypress.backend('read:file', file, _.pick(options, 'encoding'))
        .catch((err) => {
          if (err.code === 'ENOENT') {
            return {
              contents: null,
              filePath: err.filePath,
            }
          }

          return $errUtils.throwErrByPath('files.unexpected_error', {
            onFail: options._log,
            args: { cmd: 'readFile', action: 'read', file, filePath: err.filePath, error: err.message },
          })
        }).then(({ contents, filePath }) => {
          // Binary files (read with explicit `null` encoding by the user) are transmitted over the
          // websocket base64 encoded. See packages/server/lib/files.js.
          if (options.encoding === null) {
            contents = Buffer.from(contents, 'base64')
          }

          consoleProps['File Path'] = filePath
          consoleProps['Contents'] = contents

          return cy.verifyUpcomingAssertions(contents, options, {
            ensureExistenceFor: 'subject',
            onFail (err) {
              if (err.type !== 'existence') {
                return
              }

              // file exists but it shouldn't - or - file doesn't exist but it should
              const errPath = contents ? 'files.existent' : 'files.nonexistent'
              const { message, docsUrl } = $errUtils.cypressErrByPath(errPath, {
                args: { file, filePath },
              })

              err.message = message
              err.docsUrl = docsUrl
            },
            onRetry: verifyAssertions,
          })
        })
      }

      return verifyAssertions()
    },

    writeFile (fileName, contents, encoding, options = {}) {
      let userOptions = options

      if (_.isObject(encoding)) {
        userOptions = encoding
        encoding = undefined
      }

      options = _.defaults({}, userOptions, {
        // https://github.com/cypress-io/cypress/issues/1558
        // If no encoding is specified, then Cypress has historically defaulted
        // to `utf8`, because of it's focus on text files. This is in contrast to
        // NodeJs, which defaults to binary. We allow users to pass in `null`
        // to restore the default node behavior.
        encoding: encoding === undefined ? 'utf8' : encoding,
        flag: userOptions.flag ? userOptions.flag : 'w',
        log: true,
      })

      const consoleProps = {}

      if (options.log) {
        options._log = Cypress.log({
          message: fileName,
          timeout: 0,
          consoleProps () {
            return consoleProps
          },
        })
      }

      if (!fileName || !_.isString(fileName)) {
        $errUtils.throwErrByPath('files.invalid_argument', {
          onFail: options._log,
          args: { cmd: 'writeFile', file: fileName },
        })
      }

      if (!(_.isString(contents) || _.isObject(contents))) {
        $errUtils.throwErrByPath('files.invalid_contents', {
          onFail: options._log,
          args: { contents },
        })
      }

      if (Buffer.isBuffer(contents)) {
        contents = contents.toString('base64')
        options.encoding = 'base64'
      }

      if (_.isObject(contents)) {
        contents = JSON.stringify(contents, null, 2)
      }

      return Cypress.backend('write:file', fileName, contents, _.pick(options, ['encoding', 'flag']))
      .then(({ contents, filePath }) => {
        consoleProps['File Path'] = filePath
        consoleProps['Contents'] = contents

        return null
      }).catch(Promise.TimeoutError, () => {
        return $errUtils.throwErrByPath('files.timed_out', {
          onFail: options._log,
          args: { cmd: 'writeFile', file: fileName, timeout: options.timeout },
        })
      })
      .catch((err) => {
        return $errUtils.throwErrByPath('files.unexpected_error', {
          onFail: options._log,
          args: { cmd: 'writeFile', action: 'write', file: fileName, filePath: err.filePath, error: err.message },
        })
      })
    },
  })
}
