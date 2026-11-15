import React from 'react'
import Layout from '../components/layout/Layout'
import MiniPage from '../components/layout/MiniPage'
import TallyLogList from '../components/TallyLogList'
import useTallyLog from '../hooks/useTallyLog'
import { useParams } from "react-router-dom"
import useTallies from '../hooks/useTallies'

const TallyLogPage = () => {
  const { tallyId } = useParams<{tallyId: string}>()
  const logs = useTallyLog(tallyId)
  const tallies = useTallies()
  const tally = tallies?.find(tally => tally.getId() === tallyId)

  return (
    <Layout testId="tally-log">
      <MiniPage title={`${tally?.name}'s Logs`} contentPadding="0">
        <TallyLogList logs={logs} />
      </MiniPage>
    </Layout>
  )
}

export default TallyLogPage;
