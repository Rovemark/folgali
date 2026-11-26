import { institutionalMetadata, institutionalPage } from '@/components/editorial/Institutional'
import PhotoStrip from '@/components/folgali/PhotoStrip'
import { SCENES } from '@/lib/folgali/scenes'

export const generateMetadata = institutionalMetadata('comoFunciona')
// after the text, three snapshots of what it describes: meeting friends at noon, a community in the garden, a rainy match
export default institutionalPage('comoFunciona', { extra: () => <PhotoStrip photos={[SCENES.howFriends, SCENES.howCommunity, SCENES.sportsRain]} /> })
