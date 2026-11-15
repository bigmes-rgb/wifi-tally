import { makeStyles } from '@material-ui/core'
import React from 'react'
import LogType from '../domain/Log'

const useStyles = makeStyles(theme => ({
  logLine: {
    fontFamily: "monospace", // @TODO: should be part of the theme
    padding: theme.spacing(1, 2),
  },
  dense: {
    padding: theme.spacing(0.5, 1.5),
    fontSize: "0.72rem",
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  bgStatus: {
    backgroundColor: theme.palette.primary.main,
  },
  bgError: {
    backgroundColor: theme.palette.error.main,
  },
  bgWarning: {
    backgroundColor: theme.palette.warning.main,
  },
  logDate: {
    opacity: "0.5",
    fontSize: "0.8em",
  },
}))

const severityOf = (log: LogType) => log.isWarning() ? "warning" : (log.isError() ? "error" : (log.isStatus() ? "status" : "info"))

// A light's log lines, coloured by how serious they are: on the light's Logs page, and in the OBS dock (dense).
function TallyLogList({ logs, dense }: { logs?: LogType[], dense?: boolean }) {
  const classes = useStyles()
  if (!logs) return null
  return <>
    {logs.map((log, idx) => {
      const classNames = [classes.logLine, dense ? classes.dense : ""]
      if (log.isWarning()) classNames.push(classes.bgWarning)
      else if (log.isError()) classNames.push(classes.bgError)
      else if (log.isStatus()) classNames.push(classes.bgStatus)
      return <div data-testid={`log-line-${idx}`} data-severity={severityOf(log)} key={idx} className={classNames.join(" ")}>
        <time className={classes.logDate}>{dense ? log.dateTime.toLocaleTimeString() : log.dateTime.toISOString()}</time><div>{log.message}</div>
      </div>
    })}
  </>
}

export default TallyLogList
