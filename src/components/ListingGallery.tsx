import ImageCarousel from './ImageCarousel'

type Props = {
  images: string[]
  variant?: 'bike' | 'lifestyle'
}

export default function ListingGallery({ images, variant = 'bike' }: Props) {
  if (variant === 'lifestyle') {
    return (
      <ImageCarousel
        images={images}
        aspect="auto"
        fit="contain"
        bg="light"
        maxHeightClass="lg:max-h-[500px]"
        thumbWhiteBg
      />
    )
  }

  return <ImageCarousel images={images} bg="light" thumbWhiteBg />
}

