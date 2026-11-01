import React from 'react'
import ChannelSelector from '../components/ChannelSelector'
import { Tally as TallyType } from '../domain/Tally'
import useChannels from '../hooks/useChannels'
import useHubInfo from '../hooks/useHubInfo'
import useProgramPreview from '../hooks/useProgramPreview'
import { socket } from '../hooks/useSocket'
import { fade, makeStyles, Paper } from '@material-ui/core'
import UsbIcon from '@material-ui/icons/Usb'
import SystemUpdateAltIcon from '@material-ui/icons/SystemUpdateAlt'
import TallyMenu from './TallyMenu'


const useStyles = makeStyles(theme => {
    return {
        tally: {
            border: "solid 1px " + theme.palette.grey[800],
            width: "250px",
            margin: theme.spacing(1),
            backgroundColor: theme.palette.grey[700],
            overflow: "hidden",
        },
        borderInPreview: {
            borderColor: theme.palette.success.main,
        },
        borderInProgram: {
            borderColor: theme.palette.error.main,
        },
        borderUnpatched: {
            borderColor: theme.palette.grey[500],
        },
        bgInPreview: {
            backgroundColor: theme.palette.success.main,
        },
        bgInProgram: {
            backgroundColor: theme.palette.error.main,
        },
        bgUnpatched: {
            backgroundColor: theme.palette.grey[500],
        },
        tallyHead: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: theme.spacing(1, 1, 1, 2),
            borderBottom: "1px solid " + theme.palette.grey[800],
        },
        tallyHeadTitle:  {

        },
        tallyHeadIcon: {

        },
        tallyBody: {
            padding: theme.spacing(2)
        },
        tallyFoot: {
            padding: theme.spacing(1, 2),
            borderTop: "1px solid " + theme.palette.grey[800],
            fontSize: "0.75rem",
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            textTransform: "uppercase",
            fontWeight: "bold",
        },
        tallyFootMissing: {
            backgroundColor: theme.palette.warning.main,
            color: theme.palette.getContrastText(theme.palette.warning.main)
        },
        tallyFootItem: {
            textAlign: "center",
            flexGrow: 1,
        },
        // a slim band between body and foot: something about this light's program wants doing
        programNote: {
            display: "flex",
            alignItems: "center",
            gap: theme.spacing(1),
            padding: theme.spacing(0.75, 2),
            borderTop: "1px solid " + theme.palette.grey[800],
            fontSize: "0.75rem",
            color: theme.palette.warning.light,
            backgroundColor: fade(theme.palette.warning.main, 0.12),
        },
        programNoteIcon: {
            fontSize: "1rem",
        },
    }
})

type TallyProps = {
    tally: TallyType
    className?: string
}

function Tally({ tally, className }: TallyProps) {
    const channels = useChannels()
    const hub = useHubInfo()
    const [programs, previews] = useProgramPreview()
    const classes = useStyles()

    const patchTally = function (tally, channel) {
        socket.emit('tally.patch', tally.name, tally.type, channel)
    }

    const classRoot: string[] = []
    className && classRoot.push(className)
    classRoot.push(classes.tally)
    const classHead = [classes.tallyHead]
    let dataColor = "idle"
    let isActive = false
    if (!tally.isPatched()) {
        classRoot.push(classes.borderUnpatched)
        dataColor = "unpatched"
    } else if (programs && tally.isIn(programs)) {
        classRoot.push(classes.borderInProgram)
        dataColor = "program"
    } else if (previews && tally.isIn(previews)) {
        classRoot.push(classes.borderInPreview)
        dataColor = "preview"
    }
    if (tally.isActive()) {
        isActive = true
        if (!tally.isPatched()) {
            classHead.push(classes.bgUnpatched)
        } else if (programs && tally.isIn(programs)) {
            classHead.push(classes.bgInProgram)
        } else if (previews && tally.isIn(previews)) {
            classHead.push(classes.bgInPreview)
        }
    }

    return (<>
        <Paper data-color={dataColor} data-isactive={isActive} className={classRoot.join(" ")} data-testid={`tally-${tally.name}`}>
            <div className={classHead.join(" ")}><>
                <div className={classes.tallyHeadTitle}>{tally.name}</div>
                <TallyMenu className={classes.tallyHeadIcon} tally={tally} />
            </></div>
            <div className={classes.tallyBody}>
                <ChannelSelector value={tally.channelId} channels={channels} onChange={value => patchTally(tally, value)} />
            </div>
            {tally.isUdpTally() && tally.isConnected() && hub?.programStamp && tally.program !== hub.programStamp && (
                tally.program === undefined
                    ? <div className={classes.programNote} title="This light predates updates over the network. Bring it to this computer once and press Install now in Build a light; after that it updates from here." data-testid={`tally-${tally.name}-program`}>
                        <UsbIcon className={classes.programNoteIcon} /><span>Needs a USB install once</span>
                      </div>
                    : <div className={classes.programNote} title="This light runs an older program than the hub has. Press Update lights at the top of the page." data-testid={`tally-${tally.name}-program`}>
                        <SystemUpdateAltIcon className={classes.programNoteIcon} /><span>Newer program available</span>
                      </div>
            )}
            <div className={classes.tallyFoot + (tally.isActive() && tally.isMissing() ? " " + classes.tallyFootMissing : "")}>
                <div className={classes.tallyFootItem}>{ tally.isActive() ? (tally.isMissing() ? "missing": "connected") : "disconnected" }</div>
                {tally.isUdpTally() && tally.address && tally.port && (<div className={classes.tallyFootItem}>{tally.address}:{tally.port}</div>)}
            </div>
        </Paper>
    </>)
}


export default Tally;
