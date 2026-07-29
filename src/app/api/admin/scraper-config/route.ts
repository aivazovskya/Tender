import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const configs = await prisma.scraperSourceConfig.findMany({
      include: {
        dataSource: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      configs
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error?.message || 'Ошибка загрузки конфигураций скраперов'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      displayName,
      renderMode = 'STATIC',
      listUrlTemplate,
      pagination = { startPage: 1, maxPages: 5, stopOnEmpty: true },
      listItemSelector,
      fields,
      detailPage,
      respectRobotsTxt = true,
      active = true,
      checkIntervalMins = 30
    } = body;

    if (!name || !displayName || !listUrlTemplate || !listItemSelector || !fields) {
      return NextResponse.json({
        success: false,
        message: 'Заполните обязательные поля: name, displayName, listUrlTemplate, listItemSelector, fields'
      }, { status: 400 });
    }

    // Perform atomic transaction for DataSource & ScraperSourceConfig upserts
    const { dataSource, scraperConfig } = await prisma.$transaction(async (tx) => {
      const ds = await tx.dataSource.upsert({
        where: { name: name.toUpperCase().replace(/\s+/g, '_') },
        update: {
          displayName,
          adapterType: 'SCRAPER',
          isActive: active,
          checkIntervalMins
        },
        create: {
          name: name.toUpperCase().replace(/\s+/g, '_'),
          displayName,
          adapterType: 'SCRAPER',
          isActive: active,
          checkIntervalMins,
          healthStatus: 'HEALTHY'
        }
      });

      const sc = await tx.scraperSourceConfig.upsert({
        where: { dataSourceId: ds.id },
        update: {
          renderMode,
          listUrlTemplate,
          pagination,
          listItemSelector,
          fields,
          detailPage: detailPage || null,
          respectRobotsTxt,
          active
        },
        create: {
          dataSourceId: ds.id,
          renderMode,
          listUrlTemplate,
          pagination,
          listItemSelector,
          fields,
          detailPage: detailPage || null,
          respectRobotsTxt,
          active
        }
      });

      return { dataSource: ds, scraperConfig: sc };
    });

    return NextResponse.json({
      success: true,
      dataSource,
      scraperConfig
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error?.message || 'Ошибка сохранения конфигурации скрапера'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, active, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: 'ID конфигурации не указан' }, { status: 400 });
    }

    const updated = await prisma.scraperSourceConfig.update({
      where: { id },
      data: {
        active: active !== undefined ? active : undefined,
        ...updateData
      }
    });

    return NextResponse.json({
      success: true,
      scraperConfig: updated
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error?.message || 'Ошибка обновления конфигурации'
    }, { status: 500 });
  }
}
