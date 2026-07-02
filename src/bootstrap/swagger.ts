import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule, type SwaggerCustomOptions } from '@nestjs/swagger'

export function setupSwagger(app: INestApplication) {
  if (process.env.NODE_ENV === 'production') return

  const config = new DocumentBuilder()
    .setTitle('Search Service')
    .setDescription('Cortex — RAG & Hybrid Search (search-service)')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    )
    .build()

  const document = SwaggerModule.createDocument(app, config)

  const swaggerOptions: SwaggerCustomOptions = {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Search API Docs',
  }

  SwaggerModule.setup('docs', app, document, swaggerOptions)
}
